"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AITranscriptAnalyzer = void 0;
const openai_1 = __importDefault(require("openai"));
class AITranscriptAnalyzer {
    constructor(apiKey) {
        const key = apiKey || process.env.OPENAI_API_KEY;
        if (!key) {
            throw new Error('OpenAI API key is required');
        }
        this.openai = new openai_1.default({ apiKey: key });
    }
    async analyzeTranscript(callData, campaignContext) {
        try {
            console.log('🤖 Starting AI transcript analysis for call:', callData.id);
            const transcript = this.formatTranscript(callData);
            const prompt = this.buildAnalysisPrompt(transcript, callData, campaignContext);
            const completion = await this.openai.chat.completions.create({
                model: "gpt-4-turbo-preview",
                messages: [
                    {
                        role: "system",
                        content: `You are an expert sales analyst specializing in call analysis. 
            Analyze sales call transcripts and extract detailed information.
            IMPORTANT: Determine if this is a B2B (business) or B2C (consumer) lead based on context clues:
            - B2B: Company mentioned, business needs, multiple decision makers, business address
            - B2C: Personal/home address, individual decision, residential context
            Be thorough but only include information explicitly stated or clearly implied in the conversation.
            Return valid JSON matching the specified format.`
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                response_format: { type: "json_object" },
                temperature: 0.3,
                max_tokens: 2000
            });
            const analysis = JSON.parse(completion.choices[0].message.content || '{}');
            const validatedAnalysis = this.validateAnalysis(analysis, callData, campaignContext);
            console.log('✅ AI analysis completed:', {
                interested: validatedAnalysis.isInterested,
                interestLevel: validatedAnalysis.interestLevel,
                leadType: validatedAnalysis.leadType,
                hasAppointment: validatedAnalysis.appointmentRequest?.requested,
                hasCallback: validatedAnalysis.callbackRequest?.requested
            });
            return validatedAnalysis;
        }
        catch (error) {
            console.error('❌ Error in AI transcript analysis:', error);
            throw error;
        }
    }
    formatTranscript(callData) {
        if (typeof callData.transcript === 'string') {
            return callData.transcript;
        }
        if (Array.isArray(callData.transcript)) {
            return callData.transcript
                .map((turn) => `${turn.speaker}: ${turn.text}`)
                .join('\n');
        }
        if (callData.raw_webhook_data?.transcript) {
            return this.formatTranscript({ transcript: callData.raw_webhook_data.transcript });
        }
        return '';
    }
    buildAnalysisPrompt(transcript, callData, campaignContext) {
        const campaignInfo = campaignContext ? `
- Campaign Name: ${campaignContext.name || 'Unknown'}
- Campaign Type: ${campaignContext.type || 'Unknown'}
- Target Market: ${campaignContext.target_market || 'Unknown'}` : '';
        return `Analyze this sales call transcript and extract the following information in JSON format:

TRANSCRIPT:
${transcript}

ADDITIONAL CONTEXT:
- Call Duration: ${callData.duration || 0} seconds
- Call Outcome: ${callData.outcome || 'unknown'}
- Customer Phone: ${callData.customer_phone || 'unknown'}${campaignInfo}

CRITICAL: Determine if this is B2B or B2C based on:
- B2B indicators: company name, business address, job title, "our company", "we need", business pain points
- B2C indicators: home/residential address, personal needs, "my house", "my family", individual decision maker

Extract and return a JSON object with these exact fields:
{
  "isInterested": boolean (true if prospect shows any interest),
  "interestLevel": number (0-100, where 100 is extremely interested),
  "leadType": "b2b" or "b2c" (REQUIRED - determine from context),
  "contactInfo": {
    "name": "full name if mentioned",
    "firstName": "first name",
    "lastName": "last name", 
    "email": "email if mentioned",
    "phone": "phone if different from caller ID",
    "company": "company name (ONLY for B2B leads)",
    "title": "job title (ONLY for B2B leads)",
    "address": "street address",
    "city": "city",
    "state": "state",
    "zip": "zip code"
  },
  "appointmentRequest": {
    "requested": boolean,
    "date": "specific date mentioned (YYYY-MM-DD format)",
    "time": "specific time mentioned (HH:MM format)",
    "timezone": "timezone if mentioned",
    "duration": minutes as number,
    "type": "demo/consultation/follow-up",
    "notes": "any special requests"
  },
  "callbackRequest": {
    "requested": boolean,
    "preferredTime": "time range mentioned",
    "preferredDate": "date mentioned",
    "reason": "reason for callback",
    "urgency": "low/medium/high"
  },
  "keyTopics": ["array of main topics discussed"],
  "painPoints": ["array of problems/challenges mentioned"],
  "objections": ["array of concerns or objections raised"],
  "budget": "budget mentioned or range",
  "timeline": "implementation timeline mentioned",
  "decisionMaker": boolean (true if they can make purchasing decisions),
  "competitors": ["array of competitor names mentioned"],
  "nextSteps": ["array of agreed next actions"],
  "summary": "2-3 sentence summary of the call",
  "sentiment": "positive/neutral/negative",
  "businessContext": {
    "industry": "industry type (ONLY for B2B)",
    "employeeCount": "company size if mentioned",
    "currentSolution": "what they use now",
    "decisionProcess": "who else is involved"
  },
  "consumerContext": {
    "propertyType": "house/condo/apartment (ONLY for B2C)",
    "ownership": "owner/renter",
    "household": "single/family/size",
    "motivation": "main reason for interest"
  },
  "customFields": {
    "additionalNotes": "any other important information"
  }
}

IMPORTANT EXTRACTION RULES:
1. For appointment requests, look for phrases like "can we meet", "schedule a call", "book a demo", "let's set up a time"
2. Extract specific dates/times even if informal (e.g., "next Tuesday at 2pm" → calculate actual date)
3. For callbacks, note any mention of "call me back", "try again", "better time would be"
4. Interest level should consider: questions asked, enthusiasm, objections overcome, next steps agreed
5. Mark decisionMaker true if they say things like "I make the decisions", "I'm the owner", "I need to run this by..."→false
6. Extract ALL contact information mentioned, even partial`;
    }
    validateAnalysis(analysis, callData, campaignContext) {
        let leadType = analysis.leadType || 'b2c';
        if (campaignContext?.target_market) {
            if (campaignContext.target_market.toLowerCase().includes('business') ||
                campaignContext.target_market.toLowerCase().includes('b2b')) {
                leadType = 'b2b';
            }
            else if (campaignContext.target_market.toLowerCase().includes('consumer') ||
                campaignContext.target_market.toLowerCase().includes('b2c')) {
                leadType = 'b2c';
            }
        }
        if (!analysis.leadType) {
            if (analysis.contactInfo?.company || analysis.contactInfo?.title ||
                analysis.businessContext?.industry) {
                leadType = 'b2b';
            }
            else {
                leadType = 'b2c';
            }
        }
        const contactInfo = {
            name: analysis.contactInfo?.name || '',
            firstName: analysis.contactInfo?.firstName || '',
            lastName: analysis.contactInfo?.lastName || '',
            email: analysis.contactInfo?.email || '',
            phone: analysis.contactInfo?.phone || callData.customer_phone || '',
            company: leadType === 'b2b' ? (analysis.contactInfo?.company || '') : '',
            title: leadType === 'b2b' ? (analysis.contactInfo?.title || '') : '',
            address: analysis.contactInfo?.address || '',
            city: analysis.contactInfo?.city || '',
            state: analysis.contactInfo?.state || '',
            zip: analysis.contactInfo?.zip || ''
        };
        const validated = {
            isInterested: analysis.isInterested || false,
            interestLevel: Math.max(0, Math.min(100, analysis.interestLevel || 0)),
            leadType,
            contactInfo,
            appointmentRequest: analysis.appointmentRequest || { requested: false },
            callbackRequest: analysis.callbackRequest || { requested: false },
            keyTopics: Array.isArray(analysis.keyTopics) ? analysis.keyTopics : [],
            painPoints: Array.isArray(analysis.painPoints) ? analysis.painPoints : [],
            objections: Array.isArray(analysis.objections) ? analysis.objections : [],
            budget: analysis.budget || '',
            timeline: analysis.timeline || '',
            decisionMaker: analysis.decisionMaker || false,
            competitors: Array.isArray(analysis.competitors) ? analysis.competitors : [],
            nextSteps: Array.isArray(analysis.nextSteps) ? analysis.nextSteps : [],
            summary: analysis.summary || '',
            sentiment: analysis.sentiment || 'neutral',
            businessContext: leadType === 'b2b' ? {
                industry: analysis.businessContext?.industry,
                employeeCount: analysis.businessContext?.employeeCount,
                currentSolution: analysis.businessContext?.currentSolution,
                decisionProcess: analysis.businessContext?.decisionProcess
            } : undefined,
            consumerContext: leadType === 'b2c' ? {
                propertyType: analysis.consumerContext?.propertyType,
                ownership: analysis.consumerContext?.ownership,
                household: analysis.consumerContext?.household,
                motivation: analysis.consumerContext?.motivation
            } : undefined,
            customFields: analysis.customFields || {}
        };
        if (validated.appointmentRequest?.requested) {
            validated.interestLevel = Math.max(validated.interestLevel, 70);
        }
        if (validated.callbackRequest?.requested) {
            validated.interestLevel = Math.max(validated.interestLevel, 50);
        }
        if (validated.budget && validated.timeline) {
            validated.interestLevel = Math.max(validated.interestLevel, 60);
        }
        return validated;
    }
    async analyzeRealTime(partialTranscript) {
        const completion = await this.openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "Quick analysis of ongoing call. Extract: interest level (0-100), key topics, and any appointment requests."
                },
                {
                    role: "user",
                    content: partialTranscript
                }
            ],
            max_tokens: 200,
            temperature: 0.3
        });
        try {
            return JSON.parse(completion.choices[0].message.content || '{}');
        }
        catch {
            return {};
        }
    }
}
exports.AITranscriptAnalyzer = AITranscriptAnalyzer;
exports.default = AITranscriptAnalyzer;
