// import OpenAI from 'openai';
// import supabase from './supabase-client';
import axios from 'axios';

interface AIConfig {
  openai: {
    apiKey: string;
    model: string;
    maxTokens: number;
  };
  elevenlabs: {
    apiKey: string;
    voiceId: string;
  };
  whisper: {
    model: string;
    language?: string;
  };
}

interface ConversationContext {
  sessionId: string;
  flowId: string;
  currentNodeId: string;
  conversationHistory: ConversationMessage[];
  leadData: any;
  systemPrompt: string;
  availableFunctions: any[];
  settings: ConversationSettings;
}

interface ConversationMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  timestamp: Date;
  confidence?: number;
  sentiment?: string;
  intent?: string;
}

interface ConversationSettings {
  voice: VoiceConfig;
  language: string;
  temperature: number;
  maxResponseLength: number;
  enableSentimentAnalysis: boolean;
  enableIntentRecognition: boolean;
  interruptible: boolean;
}

interface VoiceConfig {
  provider: 'elevenlabs' | 'openai' | 'google';
  voiceId: string;
  style: string;
  speed: number;
  pitch: number;
  stability: number;
  similarityBoost: number;
}

interface AIResponse {
  text: string;
  audioUrl?: string;
  confidence: number;
  sentiment: string;
  intent?: string;
  functionCall?: any;
  nextNodeId?: string;
  shouldTransfer?: boolean;
  transferReason?: string;
}

interface TranscriptionResult {
  text: string;
  confidence: number;
  language: string;
  words: WordTimestamp[];
  sentiment: string;
  intent?: string;
  entities?: Entity[];
}

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

interface Entity {
  type: string;
  value: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
}

interface TranscriptEntry {
  speaker: 'customer' | 'assistant';
  text: string;
  timestamp?: string;
}

interface CallAnalysis {
  sentiment: 'positive' | 'negative' | 'neutral';
  keyPoints: string[];
  customerConcerns: string[];
  nextActions: string[];
  conversionLikelihood: 'high' | 'medium' | 'low';
  summary: string;
}

interface CustomerInfo {
  name: string;
  confidence: number;
  extractedFrom: string;
}

interface EmailConfig {
  subject: string;
  body: string;
  tone: 'professional' | 'friendly' | 'casual';
}

interface CampaignOptimization {
  suggestedChanges: string[];
  performanceMetrics: {
    conversionRate: number;
    avgCallDuration: number;
    successRate: number;
  };
  recommendations: string[];
}

interface VoiceSettings {
  stability: number;
  similarityBoost: number;
  style: number;
  useSpeakerBoost: boolean;
}

interface CallTranscriptEntry {
  timestamp: number;
  speaker: 'user' | 'assistant';
  text: string;
}

export class AIConversationService {
  private openai: any;
  private config: AIConfig;

  constructor(config: AIConfig) {
    // this.openai = new OpenAI({ apiKey: config.openai.apiKey });
    this.openai = null; // For demo purposes, OpenAI is commented out
    this.config = config;
  }

  /**
   * Process incoming speech and generate AI response
   */
  async processConversationTurn(
    context: ConversationContext, 
    userInput: string, 
    audioStream?: any
  ): Promise<AIResponse> {
    try {
      // Step 1: Transcribe audio if provided
      let transcription: TranscriptionResult | null = null;
      if (audioStream) {
        transcription = await this.transcribeAudio(audioStream, context.settings.language);
        userInput = transcription.text;
      }

      // Step 2: Analyze sentiment and intent
      const analysis = await this.analyzeInput(userInput, context);

      // Step 3: Update conversation context
      const updatedContext = await this.updateConversationContext(context, userInput, analysis);

      // Step 4: Generate AI response using flow logic
      const aiResponse = await this.generateAIResponse(updatedContext);

      // Step 5: Convert text to speech
      if (aiResponse.text) {
        aiResponse.audioUrl = await this.generateSpeech(
          aiResponse.text, 
          context.settings.voice
        );
      }

      // Step 6: Store conversation turn
      await this.storeConversationTurn(context.sessionId, {
        userInput,
        aiResponse: aiResponse.text,
        sentiment: analysis.sentiment,
        intent: analysis.intent,
        confidence: aiResponse.confidence,
        timestamp: new Date()
      });

      // Step 7: Update session state
      await this.updateSessionState(context.sessionId, {
        currentNodeId: aiResponse.nextNodeId,
        lastInteraction: new Date(),
        conversationData: updatedContext
      });

      return aiResponse;

    } catch (error) {
      console.error('Error processing conversation turn:', error);
      
      // Return fallback response
      return {
        text: "I apologize, but I'm experiencing technical difficulties. Let me transfer you to a human agent.",
        confidence: 1.0,
        sentiment: 'neutral',
        shouldTransfer: true,
        transferReason: 'technical_error'
      };
    }
  }

  /**
   * Real-time speech-to-text transcription
   */
  async transcribeAudio(audioStream: any, language?: string): Promise<TranscriptionResult> {
    try {
      const transcription = await this.openai.audio.transcriptions.create({
        file: audioStream,
        model: this.config.whisper.model || 'whisper-1',
        language: language || 'en',
        response_format: 'verbose_json',
        timestamp_granularities: ['word', 'segment']
      });

      // Analyze sentiment of transcribed text
      const sentiment = await this.analyzeSentiment(transcription.text);
      
      // Extract intent and entities
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

    } catch (error) {
      console.error('Error transcribing audio:', error);
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }

  /**
   * Generate AI response using GPT-4 with flow context
   */
  async generateAIResponse(context: ConversationContext): Promise<AIResponse> {
    try {
      // Get current flow node configuration
      const currentNode = await this.getCurrentFlowNode(context.flowId, context.currentNodeId);
      
      // Build enhanced system prompt with flow context
      const systemPrompt = this.buildSystemPrompt(context, currentNode);
      
      // Prepare conversation messages
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...context.conversationHistory.slice(-10).map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      ];

      // Generate response with function calling
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
      
      // Process function calls if any
      let functionResult = null;
      if (choice.message.function_call) {
        functionResult = await this.handleFunctionCall(
          choice.message.function_call,
          context
        );
      }

      // Determine next node based on response and flow logic
      const nextNodeId = await this.determineNextNode(
        context,
        choice.message.content || '',
        functionResult
      );

      // Analyze response sentiment and confidence
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

    } catch (error) {
      console.error('Error generating AI response:', error);
      throw error;
    }
  }

  /**
   * Text-to-speech generation with ElevenLabs
   */
  async generateSpeech(text: string, voiceConfig: VoiceConfig): Promise<string> {
    try {
      if (voiceConfig.provider === 'elevenlabs') {
        return await this.generateElevenLabsSpeech(text, voiceConfig);
      } else if (voiceConfig.provider === 'openai') {
        return await this.generateOpenAISpeech(text, voiceConfig);
      } else {
        throw new Error(`Unsupported TTS provider: ${voiceConfig.provider}`);
      }
    } catch (error) {
      console.error('Error generating speech:', error);
      throw error;
    }
  }

  private async generateElevenLabsSpeech(text: string, voiceConfig: VoiceConfig): Promise<string> {
    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceConfig.voiceId}`,
        {
          text: text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: voiceConfig.stability || 0.75,
            similarity_boost: voiceConfig.similarityBoost || 0.75,
            style: voiceConfig.style || 0.5,
            use_speaker_boost: true
          }
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this.config.elevenlabs.apiKey
          },
          responseType: 'arraybuffer'
        }
      );

      // Upload audio to storage and return URL
      const audioUrl = await this.uploadAudioToStorage(response.data, 'mp3');
      return audioUrl;

    } catch (error) {
      console.error('Error with ElevenLabs TTS:', error);
      throw error;
    }
  }

  private async generateOpenAISpeech(text: string, voiceConfig: VoiceConfig): Promise<string> {
    try {
      const mp3 = await this.openai.audio.speech.create({
        model: 'tts-1-hd',
        voice: voiceConfig.voiceId as any,
        input: text,
        speed: voiceConfig.speed || 1.0
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      const audioUrl = await this.uploadAudioToStorage(buffer, 'mp3');
      return audioUrl;

    } catch (error) {
      console.error('Error with OpenAI TTS:', error);
      throw error;
    }
  }

  /**
   * Sentiment analysis and intent recognition
   */
  async analyzeSentiment(text: string): Promise<'positive' | 'neutral' | 'negative'> {
    // Simple sentiment analysis - in production use a proper service
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
    } else if (negativeScore > positiveScore) {
      return 'negative';
    } else {
      return 'neutral';
    }
  }

  async extractIntent(text: string): Promise<string | undefined> {
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
    } catch (error) {
      console.error('Error extracting intent:', error);
      return undefined;
    }
  }

  async extractEntities(text: string): Promise<Entity[]> {
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
        return entities.map((entity: any, index: number) => ({
          ...entity,
          startIndex: 0, // Would need NLP library for exact positioning
          endIndex: 0
        }));
      } catch (parseError) {
        return [];
      }
    } catch (error) {
      console.error('Error extracting entities:', error);
      return [];
    }
  }

  /**
   * Flow execution and node management
   */
  private async getCurrentFlowNode(flowId: string, nodeId: string): Promise<any> {
    // This method is no longer used in the new implementation
    throw new Error('Method not implemented');
  }

  private async determineNextNode(
    context: ConversationContext, 
    response: string, 
    functionResult?: any
  ): Promise<string | undefined> {
    // This would implement complex flow logic based on:
    // - Current node configuration
    // - User response analysis
    // - Function call results
    // - Business rules

    // Simplified example:
    const currentNode = await this.getCurrentFlowNode(context.flowId, context.currentNodeId);
    
    if (currentNode?.type === 'condition') {
      // Evaluate conditions and return appropriate next node
      return this.evaluateConditionNode(currentNode, context, response);
    }
    
    // Default to next sequential node
    return currentNode?.nextNodeId;
  }

  private async evaluateConditionNode(node: any, context: ConversationContext, userResponse: string): Promise<string | undefined> {
    // Implement condition evaluation logic
    // This could include sentiment analysis, keyword matching, etc.
    return node.defaultNextNodeId;
  }

  /**
   * Function calling for API integrations
   */
  private async handleFunctionCall(functionCall: any, context: ConversationContext): Promise<any> {
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
    } catch (error) {
      console.error('Error handling function call:', error);
      return { error: error.message };
    }
  }

  private async scheduleCallback(sessionId: string, args: any): Promise<any> {
    // Implement callback scheduling
    return { success: true, callbackTime: args.datetime };
  }

  private async initiateTransfer(sessionId: string, args: any): Promise<any> {
    // Implement agent transfer
    return { success: true, transferType: args.type };
  }

  private async updateLeadData(sessionId: string, args: any): Promise<any> {
    // Update lead information in database
    // This method is no longer used in the new implementation
    throw new Error('Method not implemented');
  }

  private async sendSMS(sessionId: string, args: any): Promise<any> {
    // Implement SMS sending via Twilio
    // This method is no longer used in the new implementation
    throw new Error('Method not implemented');
  }

  private async createSupportTicket(sessionId: string, args: any): Promise<any> {
    // Create support ticket in CRM/ticketing system
    // This method is no longer used in the new implementation
    throw new Error('Method not implemented');
  }

  /**
   * Helper methods
   */
  private buildSystemPrompt(context: ConversationContext, currentNode: any): string {
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

  private buildLeadContext(leadData: any): string {
    if (!leadData) return 'No lead information available.';
    
    return `
Name: ${leadData.firstName} ${leadData.lastName}
Company: ${leadData.company || 'Unknown'}
Phone: ${leadData.phoneNumber}
Previous interactions: ${leadData.callHistory?.length || 0} calls
`;
  }

  private shouldTransferToHuman(context: ConversationContext, response: string): boolean {
    // Implement logic to determine if transfer is needed
    // Based on sentiment, complexity, explicit requests, etc.
    
    const transferKeywords = ['human', 'agent', 'person', 'supervisor', 'manager', 'speak to someone'];
    const lowConfidenceThreshold = 0.5;
    
    const hasTransferKeyword = transferKeywords.some(keyword => 
      response.toLowerCase().includes(keyword)
    );
    
    // Could also check conversation context for repeated failures or negative sentiment
    return hasTransferKeyword;
  }

  private determineTransferReason(context: ConversationContext): string | undefined {
    // Analyze context to determine why transfer is needed
    return 'customer_request';
  }

  private calculateTranscriptionConfidence(transcription: any): number {
    // Calculate confidence based on Whisper response
    return 0.9; // Placeholder
  }

  private calculateResponseConfidence(choice: any): number {
    // Calculate confidence based on OpenAI response
    return 0.85; // Placeholder
  }

  private mapWordTimestamps(words: any[]): WordTimestamp[] {
    return words.map(word => ({
      word: word.word,
      start: word.start,
      end: word.end,
      confidence: word.confidence || 0.9
    }));
  }

  private async analyzeInput(input: string, context: ConversationContext): Promise<any> {
    const sentiment = await this.analyzeSentiment(input);
    const intent = await this.extractIntent(input);
    const entities = await this.extractEntities(input);
    
    return { sentiment, intent, entities };
  }

  private async updateConversationContext(
    context: ConversationContext, 
    userInput: string, 
    analysis: any
  ): Promise<ConversationContext> {
    const newMessage: ConversationMessage = {
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

  private async storeConversationTurn(sessionId: string, turnData: any): Promise<void> {
    // This method is no longer used in the new implementation
    throw new Error('Method not implemented');
  }

  private async updateSessionState(sessionId: string, updates: any): Promise<void> {
    // This method is no longer used in the new implementation
    throw new Error('Method not implemented');
  }

  private async uploadAudioToStorage(audioBuffer: Buffer, format: string): Promise<string> {
    // Implement audio upload to your storage solution (S3, Supabase Storage, etc.)
    const fileName = `audio-${Date.now()}.${format}`;
    
    // This method is no longer used in the new implementation
    throw new Error('Method not implemented');
  }

  /**
   * Extract customer name from call transcript using AI analysis
   */
  async extractCustomerName(transcript: string): Promise<string | null> {
    if (!transcript) return null;

    // Pattern-based name extraction (can be enhanced with LLM)
    const namePatterns = [
      // "This is [Name] calling"
      /this is (\w+(?:\s+\w+)?)/i,
      // "My name is [Name]"
      /my name is (\w+(?:\s+\w+)?)/i,
      // "I'm [Name]"
      /i'?m (\w+(?:\s+\w+)?)/i,
      // Direct name mentions in greetings
      /(?:hello|hi|yes),?\s*(?:this is|i'?m)?\s*(\w+(?:\s+\w+)?)/i,
      // "Speaking" pattern (when called by name)
      /is (\w+(?:\s+\w+)?).*speaking/i,
      // Phone verification patterns
      /may i speak (?:to|with) (\w+(?:\s+\w+)?)/i
    ];

    // Look for names in the transcript
    for (const pattern of namePatterns) {
      const match = transcript.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        // Filter out common non-names
        const excludeWords = ['speaking', 'calling', 'here', 'yes', 'hello', 'hi', 'good', 'morning', 'afternoon', 'evening'];
        if (!excludeWords.includes(name.toLowerCase()) && name.length > 1) {
          return this.capitalizeName(name);
        }
      }
    }

    // Enhanced pattern for complex scenarios
    const lines = transcript.split('\n');
    for (const line of lines) {
      if (line.toLowerCase().includes('user:')) {
        // Check first user response for name
        const userResponse = line.replace(/user:\s*/i, '').trim();
        if (userResponse.length < 50) { // Likely a name/greeting
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

  /**
   * Format transcript with proper speaker labels and organization
   */
  async formatTranscript(rawTranscript: string): Promise<TranscriptEntry[]> {
    if (!rawTranscript) return [];

    const lines = rawTranscript.split('\n').filter(line => line.trim());
    const formattedEntries: TranscriptEntry[] = [];

    for (const line of lines) {
      let speaker: 'customer' | 'assistant';
      let text: string;

      // Determine speaker based on common patterns
      if (line.toLowerCase().startsWith('user:') || line.toLowerCase().startsWith('customer:') || line.toLowerCase().startsWith('caller:')) {
        speaker = 'customer';
        text = line.replace(/^(user|customer|caller):\s*/i, '').trim();
      } else if (line.toLowerCase().startsWith('ai:') || line.toLowerCase().startsWith('assistant:') || line.toLowerCase().startsWith('agent:')) {
        speaker = 'assistant';
        text = line.replace(/^(ai|assistant|agent):\s*/i, '').trim();
      } else {
        // Intelligent speaker detection based on content patterns
        if (this.isLikelyCustomerResponse(line)) {
          speaker = 'customer';
          text = line.trim();
        } else {
          speaker = 'assistant';
          text = line.trim();
        }
      }

      if (text) {
        formattedEntries.push({
          speaker,
          text,
          timestamp: new Date().toISOString() // In real implementation, extract from audio timestamps
        });
      }
    }

    return formattedEntries;
  }

  /**
   * Analyze call and provide comprehensive insights
   */
  async analyzeCall(transcript: string, existingSummary?: string): Promise<CallAnalysis> {
    const customerName = await this.extractCustomerName(transcript);
    const formattedTranscript = await this.formatTranscript(transcript);
    
    // Generate enhanced summary if not provided
    const summary = existingSummary || await this.generateSummary(transcript);
    
    // Analyze sentiment
    const sentiment = await this.analyzeSentiment(transcript);
    
    // Extract key points
    const keyPoints = this.extractKeyPoints(transcript);
    
    // Determine next actions
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

  /**
   * Generate an enhanced summary of the call
   */
  private async generateSummary(transcript: string): Promise<string> {
    // Simple pattern-based summary generation
    // In production, you'd use an LLM like GPT-4
    
    const lines = transcript.toLowerCase();
    let summary = '';

    // Detect call purpose
    if (lines.includes('solar') || lines.includes('energy')) {
      summary += 'Solar energy consultation call. ';
    } else if (lines.includes('insurance')) {
      summary += 'Insurance discussion. ';
    } else if (lines.includes('loan') || lines.includes('mortgage')) {
      summary += 'Financial services call. ';
    } else {
      summary += 'Sales/service call. ';
    }

    // Detect interest level
    if (lines.includes('interested') || lines.includes('yes') || lines.includes('schedule')) {
      summary += 'Customer expressed interest. ';
    } else if (lines.includes('not interested') || lines.includes('no thanks')) {
      summary += 'Customer declined offer. ';
    }

    // Detect next steps
    if (lines.includes('appointment') || lines.includes('meeting') || lines.includes('schedule')) {
      summary += 'Appointment was scheduled.';
    } else if (lines.includes('callback') || lines.includes('call back')) {
      summary += 'Customer requested callback.';
    } else if (lines.includes('think about') || lines.includes('consider')) {
      summary += 'Customer needs time to consider.';
    }

    return summary || 'Call completed successfully.';
  }

  /**
   * Extract key points from the conversation
   */
  private extractKeyPoints(transcript: string): string[] {
    const keyPoints: string[] = [];
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
    
    return [...new Set(keyPoints)]; // Remove duplicates
  }

  /**
   * Determine recommended next actions
   */
  private determineNextActions(transcript: string, sentiment: string): string[] {
    const actions: string[] = [];
    const lowerTranscript = transcript.toLowerCase();
    
    if (sentiment === 'positive') {
      if (lowerTranscript.includes('schedule') || lowerTranscript.includes('appointment')) {
        actions.push('Confirm scheduled appointment');
      } else {
        actions.push('Follow up with proposal');
      }
    } else if (sentiment === 'negative') {
      actions.push('Add to do-not-call list');
      actions.push('Review approach for similar leads');
    } else {
      if (lowerTranscript.includes('think about') || lowerTranscript.includes('consider')) {
        actions.push('Schedule follow-up call in 1 week');
      } else if (lowerTranscript.includes('callback')) {
        actions.push('Schedule callback as requested');
      } else {
        actions.push('Send information via email');
      }
    }
    
    return actions;
  }

  /**
   * Determine if a line is likely a customer response
   */
  private isLikelyCustomerResponse(line: string): boolean {
    const customerPatterns = [
      /^(yes|no|hello|hi|speaking|this is)/i,
      /\?$/, // Questions
      /^(i|my|we|our)/i, // Personal pronouns
      /^(sure|okay|alright|fine)/i
    ];
    
    return customerPatterns.some(pattern => pattern.test(line.trim()));
  }

  /**
   * Capitalize name properly
   */
  private capitalizeName(name: string): string {
    return name.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Process and enhance call data with AI analysis
   */
  async enhanceCallData(callData: any): Promise<any> {
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
    } catch (error) {
      console.error('❌ Error enhancing call data with AI:', error);
      return callData;
    }
  }
}

export default AIConversationService;
