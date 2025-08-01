"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIConversationService = void 0;
const axios_1 = __importDefault(require("axios"));
class AIConversationService {
    constructor(config) {
        this.openai = null;
        this.config = config;
    }
    async processConversationTurn(context, userInput, audioStream) {
        try {
            let transcription = null;
            if (audioStream) {
                transcription = await this.transcribeAudio(audioStream, context.settings.language);
                userInput = transcription.text;
            }
            const analysis = await this.analyzeInput(userInput, context);
            const updatedContext = await this.updateConversationContext(context, userInput, analysis);
            const aiResponse = await this.generateAIResponse(updatedContext);
            if (aiResponse.text) {
                aiResponse.audioUrl = await this.generateSpeech(aiResponse.text, context.settings.voice);
            }
            await this.storeConversationTurn(context.sessionId, {
                userInput,
                aiResponse: aiResponse.text,
                sentiment: analysis.sentiment,
                intent: analysis.intent,
                confidence: aiResponse.confidence,
                timestamp: new Date()
            });
            await this.updateSessionState(context.sessionId, {
                currentNodeId: aiResponse.nextNodeId,
                lastInteraction: new Date(),
                conversationData: updatedContext
            });
            return aiResponse;
        }
        catch (error) {
            console.error('Error processing conversation turn:', error);
            return {
                text: "I apologize, but I'm experiencing technical difficulties. Let me transfer you to a human agent.",
                confidence: 1.0,
                sentiment: 'neutral',
                shouldTransfer: true,
                transferReason: 'technical_error'
            };
        }
    }
    async transcribeAudio(audioStream, language) {
        try {
            const transcription = await this.openai.audio.transcriptions.create({
                file: audioStream,
                model: this.config.whisper.model || 'whisper-1',
                language: language || 'en',
                response_format: 'verbose_json',
                timestamp_granularities: ['word', 'segment']
            });
            const sentiment = await this.analyzeSentiment(transcription.text);
            const intent = await this.extractIntent(transcription.text);
            const entities = await this.extractEntities(transcription.text);
            return {
                text: transcription.text,
                confidence: this.calculateTranscriptionConfidence(transcription),
                language: transcription.language || language || 'en',
                words: this.mapWordTimestamps(transcription.words || []),
                sentiment: sentiment,
                intent: intent,
                entities: entities
            };
        }
        catch (error) {
            console.error('Error transcribing audio:', error);
            throw new Error(`Transcription failed: ${error.message}`);
        }
    }
    async generateAIResponse(context) {
        try {
            const currentNode = await this.getCurrentFlowNode(context.flowId, context.currentNodeId);
            const systemPrompt = this.buildSystemPrompt(context, currentNode);
            const messages = [
                { role: 'system', content: systemPrompt },
                ...context.conversationHistory.slice(-10).map(msg => ({
                    role: msg.role,
                    content: msg.content
                }))
            ];
            const completion = await this.openai.chat.completions.create({
                model: this.config.openai.model || 'gpt-4-turbo-preview',
                messages: messages,
                functions: context.availableFunctions,
                function_call: 'auto',
                temperature: context.settings.temperature || 0.7,
                max_tokens: this.config.openai.maxTokens || 150,
                stream: false
            });
            const choice = completion.choices[0];
            let functionResult = null;
            if (choice.message.function_call) {
                functionResult = await this.handleFunctionCall(choice.message.function_call, context);
            }
            const nextNodeId = await this.determineNextNode(context, choice.message.content || '', functionResult);
            const sentiment = await this.analyzeSentiment(choice.message.content || '');
            const confidence = this.calculateResponseConfidence(choice);
            return {
                text: choice.message.content || '',
                confidence: confidence,
                sentiment: sentiment,
                functionCall: choice.message.function_call,
                nextNodeId: nextNodeId,
                shouldTransfer: this.shouldTransferToHuman(context, choice.message.content || ''),
                transferReason: this.determineTransferReason(context)
            };
        }
        catch (error) {
            console.error('Error generating AI response:', error);
            throw error;
        }
    }
    async generateSpeech(text, voiceConfig) {
        try {
            if (voiceConfig.provider === 'elevenlabs') {
                return await this.generateElevenLabsSpeech(text, voiceConfig);
            }
            else if (voiceConfig.provider === 'openai') {
                return await this.generateOpenAISpeech(text, voiceConfig);
            }
            else {
                throw new Error(`Unsupported TTS provider: ${voiceConfig.provider}`);
            }
        }
        catch (error) {
            console.error('Error generating speech:', error);
            throw error;
        }
    }
    async generateElevenLabsSpeech(text, voiceConfig) {
        try {
            const response = await axios_1.default.post(`https://api.elevenlabs.io/v1/text-to-speech/${voiceConfig.voiceId}`, {
                text: text,
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                    stability: voiceConfig.stability || 0.75,
                    similarity_boost: voiceConfig.similarityBoost || 0.75,
                    style: voiceConfig.style || 0.5,
                    use_speaker_boost: true
                }
            }, {
                headers: {
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                    'xi-api-key': this.config.elevenlabs.apiKey
                },
                responseType: 'arraybuffer'
            });
            const audioUrl = await this.uploadAudioToStorage(response.data, 'mp3');
            return audioUrl;
        }
        catch (error) {
            console.error('Error with ElevenLabs TTS:', error);
            throw error;
        }
    }
    async generateOpenAISpeech(text, voiceConfig) {
        try {
            const mp3 = await this.openai.audio.speech.create({
                model: 'tts-1-hd',
                voice: voiceConfig.voiceId,
                input: text,
                speed: voiceConfig.speed || 1.0
            });
            const buffer = Buffer.from(await mp3.arrayBuffer());
            const audioUrl = await this.uploadAudioToStorage(buffer, 'mp3');
            return audioUrl;
        }
        catch (error) {
            console.error('Error with OpenAI TTS:', error);
            throw error;
        }
    }
    async analyzeSentiment(text) {
        const positiveWords = ['good', 'great', 'excellent', 'amazing', 'love', 'perfect', 'wonderful', 'fantastic', 'awesome', 'yes', 'interested', 'definitely'];
        const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'horrible', 'no', 'not interested', 'never', 'stop', 'remove'];
        const lowerText = text.toLowerCase();
        const positiveScore = positiveWords.reduce((score, word) => {
            return score + (lowerText.includes(word) ? 1 : 0);
        }, 0);
        const negativeScore = negativeWords.reduce((score, word) => {
            return score + (lowerText.includes(word) ? 1 : 0);
        }, 0);
        if (positiveScore > negativeScore) {
            return 'positive';
        }
        else if (negativeScore > positiveScore) {
            return 'negative';
        }
        else {
            return 'neutral';
        }
    }
    async extractIntent(text) {
        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: `Identify the primary intent from this text. Choose from: greeting, question, complaint, request, booking, cancellation, information, goodbye, other. Respond with only the intent word.`
                    },
                    {
                        role: 'user',
                        content: text
                    }
                ],
                max_tokens: 20,
                temperature: 0
            });
            return response.choices[0].message.content?.toLowerCase().trim();
        }
        catch (error) {
            console.error('Error extracting intent:', error);
            return undefined;
        }
    }
    async extractEntities(text) {
        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: `Extract entities from the text and return as JSON array. Each entity should have: type (person, organization, location, date, number, email, phone), value, and confidence (0-1). Example: [{"type": "person", "value": "John Smith", "confidence": 0.9}]`
                    },
                    {
                        role: 'user',
                        content: text
                    }
                ],
                max_tokens: 200,
                temperature: 0
            });
            try {
                const entities = JSON.parse(response.choices[0].message.content || '[]');
                return entities.map((entity, index) => ({
                    ...entity,
                    startIndex: 0,
                    endIndex: 0
                }));
            }
            catch (parseError) {
                return [];
            }
        }
        catch (error) {
            console.error('Error extracting entities:', error);
            return [];
        }
    }
    async getCurrentFlowNode(flowId, nodeId) {
        throw new Error('Method not implemented');
    }
    async determineNextNode(context, response, functionResult) {
        const currentNode = await this.getCurrentFlowNode(context.flowId, context.currentNodeId);
        if (currentNode?.type === 'condition') {
            return this.evaluateConditionNode(currentNode, context, response);
        }
        return currentNode?.nextNodeId;
    }
    async evaluateConditionNode(node, context, userResponse) {
        return node.defaultNextNodeId;
    }
    async handleFunctionCall(functionCall, context) {
        const { name, arguments: args } = functionCall;
        try {
            const parsedArgs = JSON.parse(args);
            switch (name) {
                case 'schedule_callback':
                    return await this.scheduleCallback(context.sessionId, parsedArgs);
                case 'transfer_to_agent':
                    return await this.initiateTransfer(context.sessionId, parsedArgs);
                case 'update_lead_data':
                    return await this.updateLeadData(context.sessionId, parsedArgs);
                case 'send_sms':
                    return await this.sendSMS(context.sessionId, parsedArgs);
                case 'create_ticket':
                    return await this.createSupportTicket(context.sessionId, parsedArgs);
                default:
                    console.warn(`Unknown function call: ${name}`);
                    return { error: 'Unknown function' };
            }
        }
        catch (error) {
            console.error('Error handling function call:', error);
            return { error: error.message };
        }
    }
    async scheduleCallback(sessionId, args) {
        return { success: true, callbackTime: args.datetime };
    }
    async initiateTransfer(sessionId, args) {
        return { success: true, transferType: args.type };
    }
    async updateLeadData(sessionId, args) {
        throw new Error('Method not implemented');
    }
    async sendSMS(sessionId, args) {
        throw new Error('Method not implemented');
    }
    async createSupportTicket(sessionId, args) {
        throw new Error('Method not implemented');
    }
    buildSystemPrompt(context, currentNode) {
        const basePrompt = context.systemPrompt || 'You are a helpful AI assistant.';
        const nodePrompt = currentNode?.config?.promptText || '';
        const leadContext = this.buildLeadContext(context.leadData);
        return `${basePrompt}

Current conversation node: ${currentNode?.name || 'Unknown'}
Node instructions: ${nodePrompt}

Lead information: ${leadContext}

Guidelines:
- Keep responses concise and natural
- Ask one question at a time
- Be empathetic and professional
- Use the available functions when appropriate
- If you cannot help, offer to transfer to a human agent`;
    }
    buildLeadContext(leadData) {
        if (!leadData)
            return 'No lead information available.';
        return `
Name: ${leadData.firstName} ${leadData.lastName}
Company: ${leadData.company || 'Unknown'}
Phone: ${leadData.phoneNumber}
Previous interactions: ${leadData.callHistory?.length || 0} calls
`;
    }
    shouldTransferToHuman(context, response) {
        const transferKeywords = ['human', 'agent', 'person', 'supervisor', 'manager', 'speak to someone'];
        const lowConfidenceThreshold = 0.5;
        const hasTransferKeyword = transferKeywords.some(keyword => response.toLowerCase().includes(keyword));
        return hasTransferKeyword;
    }
    determineTransferReason(context) {
        return 'customer_request';
    }
    calculateTranscriptionConfidence(transcription) {
        return 0.9;
    }
    calculateResponseConfidence(choice) {
        return 0.85;
    }
    mapWordTimestamps(words) {
        return words.map(word => ({
            word: word.word,
            start: word.start,
            end: word.end,
            confidence: word.confidence || 0.9
        }));
    }
    async analyzeInput(input, context) {
        const sentiment = await this.analyzeSentiment(input);
        const intent = await this.extractIntent(input);
        const entities = await this.extractEntities(input);
        return { sentiment, intent, entities };
    }
    async updateConversationContext(context, userInput, analysis) {
        const newMessage = {
            role: 'user',
            content: userInput,
            timestamp: new Date(),
            sentiment: analysis.sentiment,
            intent: analysis.intent
        };
        return {
            ...context,
            conversationHistory: [...context.conversationHistory, newMessage]
        };
    }
    async storeConversationTurn(sessionId, turnData) {
        throw new Error('Method not implemented');
    }
    async updateSessionState(sessionId, updates) {
        throw new Error('Method not implemented');
    }
    async uploadAudioToStorage(audioBuffer, format) {
        const fileName = `audio-${Date.now()}.${format}`;
        throw new Error('Method not implemented');
    }
    async extractCustomerName(transcript) {
        if (!transcript)
            return null;
        const namePatterns = [
            /this is (\w+(?:\s+\w+)?)/i,
            /my name is (\w+(?:\s+\w+)?)/i,
            /i'?m (\w+(?:\s+\w+)?)/i,
            /(?:hello|hi|yes),?\s*(?:this is|i'?m)?\s*(\w+(?:\s+\w+)?)/i,
            /is (\w+(?:\s+\w+)?).*speaking/i,
            /may i speak (?:to|with) (\w+(?:\s+\w+)?)/i
        ];
        for (const pattern of namePatterns) {
            const match = transcript.match(pattern);
            if (match && match[1]) {
                const name = match[1].trim();
                const excludeWords = ['speaking', 'calling', 'here', 'yes', 'hello', 'hi', 'good', 'morning', 'afternoon', 'evening'];
                if (!excludeWords.includes(name.toLowerCase()) && name.length > 1) {
                    return this.capitalizeName(name);
                }
            }
        }
        const lines = transcript.split('\n');
        for (const line of lines) {
            if (line.toLowerCase().includes('user:')) {
                const userResponse = line.replace(/user:\s*/i, '').trim();
                if (userResponse.length < 50) {
                    const words = userResponse.split(' ');
                    for (const word of words) {
                        if (word.length > 2 && /^[A-Z][a-z]+$/.test(word) && !['Yes', 'Hello', 'Hi', 'Good'].includes(word)) {
                            return word;
                        }
                    }
                }
            }
        }
        return null;
    }
    async formatTranscript(rawTranscript) {
        if (!rawTranscript)
            return [];
        const lines = rawTranscript.split('\n').filter(line => line.trim());
        const formattedEntries = [];
        for (const line of lines) {
            let speaker;
            let text;
            if (line.toLowerCase().startsWith('user:') || line.toLowerCase().startsWith('customer:') || line.toLowerCase().startsWith('caller:')) {
                speaker = 'customer';
                text = line.replace(/^(user|customer|caller):\s*/i, '').trim();
            }
            else if (line.toLowerCase().startsWith('ai:') || line.toLowerCase().startsWith('assistant:') || line.toLowerCase().startsWith('agent:')) {
                speaker = 'assistant';
                text = line.replace(/^(ai|assistant|agent):\s*/i, '').trim();
            }
            else {
                if (this.isLikelyCustomerResponse(line)) {
                    speaker = 'customer';
                    text = line.trim();
                }
                else {
                    speaker = 'assistant';
                    text = line.trim();
                }
            }
            if (text) {
                formattedEntries.push({
                    speaker,
                    text,
                    timestamp: new Date().toISOString()
                });
            }
        }
        return formattedEntries;
    }
    async analyzeCall(transcript, existingSummary) {
        const customerName = await this.extractCustomerName(transcript);
        const formattedTranscript = await this.formatTranscript(transcript);
        const summary = existingSummary || await this.generateSummary(transcript);
        const sentiment = await this.analyzeSentiment(transcript);
        const keyPoints = this.extractKeyPoints(transcript);
        const nextActions = this.determineNextActions(transcript, sentiment);
        return {
            customerName,
            formattedTranscript,
            summary,
            sentiment,
            keyPoints,
            nextActions
        };
    }
    async generateSummary(transcript) {
        const lines = transcript.toLowerCase();
        let summary = '';
        if (lines.includes('solar') || lines.includes('energy')) {
            summary += 'Solar energy consultation call. ';
        }
        else if (lines.includes('insurance')) {
            summary += 'Insurance discussion. ';
        }
        else if (lines.includes('loan') || lines.includes('mortgage')) {
            summary += 'Financial services call. ';
        }
        else {
            summary += 'Sales/service call. ';
        }
        if (lines.includes('interested') || lines.includes('yes') || lines.includes('schedule')) {
            summary += 'Customer expressed interest. ';
        }
        else if (lines.includes('not interested') || lines.includes('no thanks')) {
            summary += 'Customer declined offer. ';
        }
        if (lines.includes('appointment') || lines.includes('meeting') || lines.includes('schedule')) {
            summary += 'Appointment was scheduled.';
        }
        else if (lines.includes('callback') || lines.includes('call back')) {
            summary += 'Customer requested callback.';
        }
        else if (lines.includes('think about') || lines.includes('consider')) {
            summary += 'Customer needs time to consider.';
        }
        return summary || 'Call completed successfully.';
    }
    extractKeyPoints(transcript) {
        const keyPoints = [];
        const lines = transcript.split('\n');
        for (const line of lines) {
            if (line.toLowerCase().includes('price') || line.toLowerCase().includes('cost')) {
                keyPoints.push('Pricing discussed');
            }
            if (line.toLowerCase().includes('schedule') || line.toLowerCase().includes('appointment')) {
                keyPoints.push('Appointment mentioned');
            }
            if (line.toLowerCase().includes('email') || line.toLowerCase().includes('send')) {
                keyPoints.push('Information sharing requested');
            }
            if (line.toLowerCase().includes('callback') || line.toLowerCase().includes('call back')) {
                keyPoints.push('Follow-up requested');
            }
        }
        return [...new Set(keyPoints)];
    }
    determineNextActions(transcript, sentiment) {
        const actions = [];
        const lowerTranscript = transcript.toLowerCase();
        if (sentiment === 'positive') {
            if (lowerTranscript.includes('schedule') || lowerTranscript.includes('appointment')) {
                actions.push('Confirm scheduled appointment');
            }
            else {
                actions.push('Follow up with proposal');
            }
        }
        else if (sentiment === 'negative') {
            actions.push('Add to do-not-call list');
            actions.push('Review approach for similar leads');
        }
        else {
            if (lowerTranscript.includes('think about') || lowerTranscript.includes('consider')) {
                actions.push('Schedule follow-up call in 1 week');
            }
            else if (lowerTranscript.includes('callback')) {
                actions.push('Schedule callback as requested');
            }
            else {
                actions.push('Send information via email');
            }
        }
        return actions;
    }
    isLikelyCustomerResponse(line) {
        const customerPatterns = [
            /^(yes|no|hello|hi|speaking|this is)/i,
            /\?$/,
            /^(i|my|we|our)/i,
            /^(sure|okay|alright|fine)/i
        ];
        return customerPatterns.some(pattern => pattern.test(line.trim()));
    }
    capitalizeName(name) {
        return name.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }
    async enhanceCallData(callData) {
        if (!callData.transcript) {
            return callData;
        }
        try {
            const analysis = await this.analyzeCall(callData.transcript, callData.summary);
            return {
                ...callData,
                customerName: analysis.customerName || callData.customerName,
                formattedTranscript: analysis.formattedTranscript,
                summary: analysis.summary,
                sentiment: analysis.sentiment,
                keyPoints: analysis.keyPoints,
                nextActions: analysis.nextActions,
                aiEnhanced: true
            };
        }
        catch (error) {
            console.error('❌ Error enhancing call data with AI:', error);
            return callData;
        }
    }
}
exports.AIConversationService = AIConversationService;
exports.default = AIConversationService;
