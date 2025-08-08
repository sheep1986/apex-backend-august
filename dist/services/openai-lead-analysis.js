"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAILeadAnalysis = void 0;
const openai_1 = __importDefault(require("openai"));
const supabase_client_1 = __importDefault(require("./supabase-client"));
class OpenAILeadAnalysis {
    constructor() {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY environment variable is required');
        }
        this.openai = new openai_1.default({
            apiKey: apiKey
        });
    }
    async analyzeCallTranscript(transcript, callData) {
        const prompt = `
You are an expert sales call analyst. Analyze this call transcript and extract comprehensive lead qualification data.

CALL TRANSCRIPT:
${transcript}

ANALYSIS REQUIREMENTS:
Provide a detailed JSON response with the following structure:

{
  "leadQuality": "hot|warm|cold|unqualified",
  "confidenceScore": 0.95,
  "keyInsights": ["key insight 1", "key insight 2"],
  "contactInfo": {
    "firstName": "extracted first name",
    "lastName": "extracted last name", 
    "phone": "extracted phone if mentioned",
    "email": "extracted email if mentioned",
    "company": "extracted company if mentioned",
    "address": "extracted address if mentioned"
  },
  "leadData": {
    "interestLevel": 8,
    "budget": "high|medium|low|unknown",
    "timeline": "immediate|short|medium|long|unknown",
    "decisionMaker": true,
    "painPoints": ["pain point 1", "pain point 2"],
    "nextSteps": "description of agreed next steps"
  },
  "qualification": {
    "qualified": true,
    "reason": "clear explanation of qualification decision",
    "followUpRequired": true,
    "priority": "high|medium|low"
  }
}

SCORING CRITERIA:
- HOT: Immediate interest, budget confirmed, appointment scheduled, decision maker
- WARM: Strong interest, some budget indication, timeline discussed
- COLD: Mild interest, unclear budget/timeline, needs nurturing
- UNQUALIFIED: No interest, no budget, not decision maker, do not call requests

Interest Level (1-10):
- 10: Ready to buy now, appointment scheduled
- 8-9: Very interested, discussing specifics
- 6-7: Interested but needs more information
- 4-5: Mild interest, exploring options
- 1-3: Little to no interest

Confidence Score (0-1): How confident you are in your analysis based on available information.

Extract ALL mentioned contact details, pain points, objections, and next steps from the conversation.
`;
        try {
            const completion = await this.openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "You are an expert sales call analyst. Always respond with valid JSON only, no additional text or formatting."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 1500
            });
            const response = completion.choices[0]?.message?.content;
            if (!response) {
                throw new Error('No response from OpenAI');
            }
            const analysis = JSON.parse(response);
            console.log('✅ OpenAI call analysis completed:', {
                leadQuality: analysis.leadQuality,
                confidenceScore: analysis.confidenceScore,
                qualified: analysis.qualification.qualified
            });
            return analysis;
        }
        catch (error) {
            console.error('❌ OpenAI analysis failed:', error);
            return this.createFallbackAnalysis(transcript, callData);
        }
    }
    async createContactFromAnalysis(analysis, callId, organizationId, campaignId) {
        try {
            let existingContact = null;
            if (analysis.contactInfo.phone) {
                const { data } = await supabase_client_1.default
                    .from('contacts')
                    .select('id')
                    .eq('phone', analysis.contactInfo.phone)
                    .eq('organization_id', organizationId)
                    .single();
                existingContact = data;
            }
            const contactData = {
                organization_id: organizationId,
                campaign_id: campaignId,
                first_name: analysis.contactInfo.firstName,
                last_name: analysis.contactInfo.lastName,
                email: analysis.contactInfo.email,
                phone: analysis.contactInfo.phone,
                company: analysis.contactInfo.company,
                job_title: null,
                source: 'ai_voice_call',
                tags: [
                    'ai_qualified',
                    analysis.leadQuality,
                    `interest_${analysis.leadData.interestLevel}`,
                    analysis.qualification.priority + '_priority'
                ],
                notes: this.generateContactNotes(analysis),
                status: analysis.qualification.qualified ? 'qualified' : 'unqualified',
                priority: analysis.qualification.priority,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                custom_fields: {
                    ai_analysis: analysis,
                    confidence_score: analysis.confidenceScore,
                    call_id: callId,
                    analyzed_at: new Date().toISOString()
                }
            };
            let contact;
            if (existingContact) {
                const { data, error } = await supabase_client_1.default
                    .from('contacts')
                    .update(contactData)
                    .eq('id', existingContact.id)
                    .select()
                    .single();
                if (error)
                    throw error;
                contact = data;
                console.log(`✅ Updated existing contact: ${contact.first_name} ${contact.last_name}`);
            }
            else {
                const { data, error } = await supabase_client_1.default
                    .from('contacts')
                    .insert(contactData)
                    .select()
                    .single();
                if (error)
                    throw error;
                contact = data;
                console.log(`✅ Created new contact: ${contact.first_name} ${contact.last_name}`);
            }
            await supabase_client_1.default
                .from('calls')
                .update({
                ai_confidence_score: analysis.confidenceScore,
                human_review_required: analysis.qualification.followUpRequired,
                ai_analysis_completed: true,
                contact_created: true,
                updated_at: new Date().toISOString()
            })
                .eq('id', callId);
            return contact;
        }
        catch (error) {
            console.error('❌ Error creating contact from analysis:', error);
            throw error;
        }
    }
    async processCall(callId) {
        try {
            const { data: call, error } = await supabase_client_1.default
                .from('calls')
                .select('*')
                .eq('id', callId)
                .single();
            if (error || !call) {
                throw new Error(`Call not found: ${callId}`);
            }
            if (!call.transcript) {
                console.log('⚠️ Call has no transcript, skipping analysis');
                return null;
            }
            console.log(`🔍 Analyzing call ${callId} with OpenAI...`);
            const analysis = await this.analyzeCallTranscript(call.transcript, call);
            if (analysis.qualification.qualified) {
                const contact = await this.createContactFromAnalysis(analysis, callId, call.organization_id, call.campaign_id);
                return { analysis, contact };
            }
            else {
                console.log(`⚠️ Call ${callId} not qualified: ${analysis.qualification.reason}`);
                return { analysis, contact: null };
            }
        }
        catch (error) {
            console.error(`❌ Error processing call ${callId}:`, error);
            throw error;
        }
    }
    generateContactNotes(analysis) {
        const notes = [];
        notes.push(`AI Qualified Lead from voice call\n`);
        if (analysis.keyInsights.length > 0) {
            notes.push(`Key Insights:`);
            analysis.keyInsights.forEach(insight => notes.push(`- ${insight}`));
            notes.push('');
        }
        if (analysis.leadData.painPoints.length > 0) {
            notes.push(`Pain Points:`);
            analysis.leadData.painPoints.forEach(point => notes.push(`- ${point}`));
            notes.push('');
        }
        if (analysis.leadData.nextSteps) {
            notes.push(`Next Steps: ${analysis.leadData.nextSteps}\n`);
        }
        if (analysis.contactInfo.address) {
            notes.push(`Address: ${analysis.contactInfo.address}`);
        }
        notes.push(`AI Confidence Score: ${Math.round(analysis.confidenceScore * 100)}%`);
        notes.push(`Interest Level: ${analysis.leadData.interestLevel}/10`);
        return notes.join('\n');
    }
    createFallbackAnalysis(transcript, callData) {
        const lowerTranscript = transcript.toLowerCase();
        const hasInterest = lowerTranscript.includes('interested') ||
            lowerTranscript.includes('yes') ||
            lowerTranscript.includes('appointment');
        const hasNegative = lowerTranscript.includes('not interested') ||
            lowerTranscript.includes('no thank you') ||
            lowerTranscript.includes('do not call');
        return {
            leadQuality: hasInterest && !hasNegative ? 'warm' : 'cold',
            confidenceScore: 0.6,
            keyInsights: ['Basic analysis - OpenAI unavailable'],
            contactInfo: {
                firstName: 'Unknown',
                lastName: '',
                phone: callData?.to_number || ''
            },
            leadData: {
                interestLevel: hasInterest ? 6 : 3,
                budget: 'unknown',
                timeline: 'unknown',
                decisionMaker: false,
                painPoints: [],
                nextSteps: 'Follow up required'
            },
            qualification: {
                qualified: hasInterest && !hasNegative,
                reason: 'Basic keyword analysis',
                followUpRequired: true,
                priority: 'medium'
            }
        };
    }
}
exports.OpenAILeadAnalysis = OpenAILeadAnalysis;
exports.default = OpenAILeadAnalysis;
