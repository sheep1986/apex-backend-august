"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallAnalysisService = void 0;
const events_1 = require("events");
const openai_1 = __importDefault(require("openai"));
class CallAnalysisService extends events_1.EventEmitter {
    constructor(pool) {
        super();
        this.pool = pool;
        this.openai = new openai_1.default({
            apiKey: process.env.OPENAI_API_KEY || '',
        });
        this.defaultCriteria = {
            min_score: 70,
            required_fields: ['budget', 'timeline', 'authority'],
            disqualifying_phrases: [
                'not interested',
                'remove from list',
                'stop calling',
                'no budget',
                'no authority',
                'not decision maker'
            ],
            high_intent_phrases: [
                'looking for',
                'need help',
                'interested in',
                'want to know more',
                'schedule a meeting',
                'send information',
                'ready to move forward'
            ],
            budget_keywords: [
                'budget', 'cost', 'price', 'investment', 'spend', 'afford',
                'thousand', 'million', 'dollar', '$', 'expensive', 'cheap'
            ],
            timeline_keywords: [
                'when', 'timeline', 'deadline', 'asap', 'immediately', 'soon',
                'next month', 'next quarter', 'this year', 'urgent', 'priority'
            ],
            authority_keywords: [
                'decision maker', 'authorize', 'approve', 'sign off', 'ceo', 'cto',
                'director', 'manager', 'owner', 'partner', 'board', 'committee'
            ]
        };
    }
    async analyzeCall(input) {
        try {
            console.log(`🤖 Analyzing call ${input.callId} with GPT-4...`);
            const criteria = await this.getQualificationCriteria(input.campaignId);
            const analysis = await this.performGPTAnalysis(input, criteria);
            const enhancedAnalysis = await this.enhanceAnalysis(analysis, input);
            await this.storeAnalysis(input, enhancedAnalysis);
            await this.processQualificationDecision(input, enhancedAnalysis);
            this.emit('analysis_complete', {
                call_id: input.callId,
                lead_id: input.leadId,
                campaign_id: input.campaignId,
                qualification_score: enhancedAnalysis.qualification_score,
                recommended_action: enhancedAnalysis.recommended_action
            });
            console.log(`✅ Call analysis complete for ${input.callId}: ${enhancedAnalysis.qualification_score}/100`);
            return enhancedAnalysis;
        }
        catch (error) {
            console.error('Call analysis failed:', error);
            await this.storeAnalysisError(input, error);
            throw error;
        }
    }
    async performGPTAnalysis(input, criteria) {
        const prompt = this.buildAnalysisPrompt(input, criteria);
        const response = await this.openai.chat.completions.create({
            model: 'gpt-4-turbo-preview',
            messages: [
                {
                    role: 'system',
                    content: this.getSystemPrompt(criteria)
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: 2000,
            response_format: { type: 'json_object' }
        });
        const analysisText = response.choices[0].message.content;
        if (!analysisText) {
            throw new Error('No analysis response from GPT-4');
        }
        try {
            const analysis = JSON.parse(analysisText);
            return this.validateAnalysisResult(analysis);
        }
        catch (parseError) {
            console.error('Failed to parse GPT-4 response:', parseError);
            throw new Error('Invalid analysis response format');
        }
    }
    buildAnalysisPrompt(input, criteria) {
        return `
Analyze the following sales call transcript and provide a comprehensive qualification assessment:

**Call Information:**
- Duration: ${input.duration} seconds
- Call ID: ${input.callId}
${input.summary ? `- Summary: ${input.summary}` : ''}

**Qualification Criteria:**
- Minimum qualifying score: ${criteria.min_score}
- Required fields: ${criteria.required_fields.join(', ')}
- High intent phrases: ${criteria.high_intent_phrases.join(', ')}
- Disqualifying phrases: ${criteria.disqualifying_phrases.join(', ')}

**Transcript:**
${input.transcript}

Please analyze this call and provide a detailed assessment of the lead's qualification potential.
    `.trim();
    }
    getSystemPrompt(criteria) {
        return `
You are an expert sales call analyst specializing in lead qualification for B2B cold calling campaigns. 

Your task is to analyze sales call transcripts and provide detailed qualification assessments that help sales teams identify high-potential leads and determine appropriate next steps.

**Analysis Framework:**
1. **Qualification Score (0-100)**: Overall lead quality based on BANT criteria
2. **Interest Level (1-10)**: Prospect's demonstrated interest in the solution
3. **Sentiment Analysis**: Overall tone and emotional indicators
4. **BANT Assessment**: Budget, Authority, Need, Timeline evaluation
5. **Next Steps**: Recommended actions based on the conversation

**Key Evaluation Criteria:**
- Budget: Evidence of financial capacity and budget allocation
- Authority: Decision-making power and influence level
- Need: Pain points and business challenges identified
- Timeline: Urgency and implementation timeframe
- Fit: Product-market fit and use case alignment

**Scoring Guidelines:**
- 90-100: Highly qualified, ready to advance
- 70-89: Qualified, needs nurturing
- 50-69: Somewhat qualified, requires follow-up
- 30-49: Poorly qualified, low priority
- 0-29: Disqualified, not a fit

**Response Format:**
Return a JSON object with the following structure:
{
  "qualification_score": number,
  "interest_level": number,
  "sentiment_score": number,
  "budget_discussed": boolean,
  "budget_range": string,
  "timeline_mentioned": boolean,
  "timeline_days": number,
  "decision_maker": boolean,
  "authority_level": number,
  "next_steps_agreed": boolean,
  "next_steps": string,
  "objections": string[],
  "pain_points": string[],
  "buying_signals": string[],
  "competitive_mentions": string[],
  "summary": string,
  "key_quotes": string[],
  "recommended_action": string,
  "callback_reason": string,
  "follow_up_priority": string,
  "tags": string[],
  "custom_fields": {}
}

**Important Notes:**
- Be objective and evidence-based in your analysis
- Consider the specific industry context and use case
- Identify subtle buying signals and objections
- Provide actionable insights for sales follow-up
- Flag any compliance concerns or red flags
    `.trim();
    }
    validateAnalysisResult(analysis) {
        return {
            qualification_score: this.clamp(analysis.qualification_score || 0, 0, 100),
            interest_level: this.clamp(analysis.interest_level || 1, 1, 10),
            sentiment_score: this.clamp(analysis.sentiment_score || 0, -1, 1),
            budget_discussed: Boolean(analysis.budget_discussed),
            budget_range: analysis.budget_range || null,
            timeline_mentioned: Boolean(analysis.timeline_mentioned),
            timeline_days: analysis.timeline_days || null,
            decision_maker: Boolean(analysis.decision_maker),
            authority_level: this.clamp(analysis.authority_level || 1, 1, 5),
            next_steps_agreed: Boolean(analysis.next_steps_agreed),
            next_steps: analysis.next_steps || null,
            objections: Array.isArray(analysis.objections) ? analysis.objections : [],
            pain_points: Array.isArray(analysis.pain_points) ? analysis.pain_points : [],
            buying_signals: Array.isArray(analysis.buying_signals) ? analysis.buying_signals : [],
            competitive_mentions: Array.isArray(analysis.competitive_mentions) ? analysis.competitive_mentions : [],
            summary: analysis.summary || 'No summary available',
            key_quotes: Array.isArray(analysis.key_quotes) ? analysis.key_quotes : [],
            recommended_action: this.validateAction(analysis.recommended_action),
            callback_reason: analysis.callback_reason || null,
            follow_up_priority: this.validatePriority(analysis.follow_up_priority),
            tags: Array.isArray(analysis.tags) ? analysis.tags : [],
            custom_fields: analysis.custom_fields || {}
        };
    }
    async enhanceAnalysis(analysis, input) {
        const sentimentAnalysis = await this.analyzeSentiment(input.transcript);
        analysis.sentiment_score = sentimentAnalysis.sentiment_score;
        const insights = this.extractInsights(input.transcript);
        analysis.pain_points = [...analysis.pain_points, ...insights.pain_points];
        analysis.buying_signals = [...analysis.buying_signals, ...insights.buying_signals];
        analysis.qualification_score = this.calculateCompositeScore(analysis);
        return analysis;
    }
    async analyzeSentiment(transcript) {
        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4-turbo-preview',
                messages: [
                    {
                        role: 'system',
                        content: 'Analyze the sentiment of the following sales call transcript. Return a JSON object with sentiment analysis.'
                    },
                    {
                        role: 'user',
                        content: `Analyze the sentiment of this call transcript:\n\n${transcript}`
                    }
                ],
                temperature: 0.1,
                max_tokens: 500,
                response_format: { type: 'json_object' }
            });
            const result = JSON.parse(response.choices[0].message.content || '{}');
            return {
                overall_sentiment: result.overall_sentiment || 'neutral',
                sentiment_score: result.sentiment_score || 0,
                confidence: result.confidence || 0.5,
                emotional_indicators: result.emotional_indicators || [],
                tone_analysis: result.tone_analysis || {
                    friendly: 0.5,
                    professional: 0.5,
                    frustrated: 0,
                    excited: 0,
                    skeptical: 0
                }
            };
        }
        catch (error) {
            console.error('Sentiment analysis failed:', error);
            return {
                overall_sentiment: 'neutral',
                sentiment_score: 0,
                confidence: 0,
                emotional_indicators: [],
                tone_analysis: {
                    friendly: 0.5,
                    professional: 0.5,
                    frustrated: 0,
                    excited: 0,
                    skeptical: 0
                }
            };
        }
    }
    extractInsights(transcript) {
        const painPointKeywords = [
            'problem', 'issue', 'challenge', 'difficulty', 'struggle', 'pain',
            'frustrated', 'expensive', 'time-consuming', 'inefficient', 'manual'
        ];
        const buyingSignalKeywords = [
            'interested', 'need', 'want', 'looking for', 'shopping', 'evaluate',
            'compare', 'budget', 'timeline', 'implement', 'purchase', 'buy'
        ];
        const extractedPainPoints = [];
        const extractedBuyingSignals = [];
        const sentences = transcript.split(/[.!?]+/);
        for (const sentence of sentences) {
            const lowerSentence = sentence.toLowerCase();
            if (painPointKeywords.some(keyword => lowerSentence.includes(keyword))) {
                extractedPainPoints.push(sentence.trim());
            }
            if (buyingSignalKeywords.some(keyword => lowerSentence.includes(keyword))) {
                extractedBuyingSignals.push(sentence.trim());
            }
        }
        return {
            pain_points: extractedPainPoints.slice(0, 5),
            buying_signals: extractedBuyingSignals.slice(0, 5)
        };
    }
    calculateCompositeScore(analysis) {
        let score = 0;
        let factors = 0;
        score += (analysis.interest_level / 10) * 30;
        factors += 30;
        if (analysis.budget_discussed) {
            score += 20;
        }
        factors += 20;
        if (analysis.timeline_mentioned) {
            score += 15;
        }
        factors += 15;
        if (analysis.decision_maker) {
            score += 15;
        }
        factors += 15;
        score += (analysis.authority_level / 5) * 10;
        factors += 10;
        score += ((analysis.sentiment_score + 1) / 2) * 10;
        factors += 10;
        return Math.round(score);
    }
    async getQualificationCriteria(campaignId) {
        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT qualification_criteria FROM campaigns WHERE id = $1', [campaignId]);
            if (result.rows.length > 0 && result.rows[0].qualification_criteria) {
                return { ...this.defaultCriteria, ...result.rows[0].qualification_criteria };
            }
            return this.defaultCriteria;
        }
        finally {
            client.release();
        }
    }
    async storeAnalysis(input, analysis) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(`
        INSERT INTO vapi_call_transcripts (
          call_attempt_id, vapi_call_id, transcript, recording_url, 
          ai_analysis, qualification_score, interest_level, 
          sentiment_analysis, extracted_data, created_at
        ) VALUES (
          (SELECT id FROM vapi_call_attempts WHERE vapi_call_id = $1),
          $1, $2, $3, $4, $5, $6, $7, $8, NOW()
        )
        ON CONFLICT (vapi_call_id) DO UPDATE SET
          ai_analysis = EXCLUDED.ai_analysis,
          qualification_score = EXCLUDED.qualification_score,
          interest_level = EXCLUDED.interest_level,
          sentiment_analysis = EXCLUDED.sentiment_analysis,
          extracted_data = EXCLUDED.extracted_data
      `, [
                input.callId,
                input.transcript,
                input.recordingUrl,
                JSON.stringify(analysis),
                analysis.qualification_score,
                analysis.interest_level,
                JSON.stringify({ sentiment_score: analysis.sentiment_score }),
                JSON.stringify({
                    budget_range: analysis.budget_range,
                    timeline_days: analysis.timeline_days,
                    pain_points: analysis.pain_points,
                    buying_signals: analysis.buying_signals,
                    objections: analysis.objections
                })
            ]);
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async processQualificationDecision(input, analysis) {
        const client = await this.pool.connect();
        try {
            const criteria = await this.getQualificationCriteria(input.campaignId);
            if (analysis.qualification_score >= criteria.min_score) {
                await this.createQualifiedLead(input, analysis);
                await client.query(`
          UPDATE crm_leads 
          SET status = 'qualified', updated_at = NOW()
          WHERE id = $1
        `, [input.leadId]);
                console.log(`🎯 Lead ${input.leadId} qualified with score ${analysis.qualification_score}`);
                this.emit('lead_qualified', {
                    lead_id: input.leadId,
                    campaign_id: input.campaignId,
                    qualification_score: analysis.qualification_score,
                    recommended_action: analysis.recommended_action
                });
            }
            else {
                await client.query(`
          UPDATE crm_leads 
          SET status = 'contacted', updated_at = NOW()
          WHERE id = $1
        `, [input.leadId]);
                console.log(`❌ Lead ${input.leadId} not qualified (score: ${analysis.qualification_score})`);
            }
        }
        finally {
            client.release();
        }
    }
    async createQualifiedLead(input, analysis) {
        const client = await this.pool.connect();
        try {
            await client.query(`
        INSERT INTO qualified_leads (
          lead_id, campaign_id, account_id, qualification_score, interest_level,
          budget_range, timeline_days, decision_maker, pain_points, next_steps,
          ai_summary, recommended_action, status, created_at
        ) VALUES (
          $1, $2, 
          (SELECT account_id FROM campaigns WHERE id = $2),
          $3, $4, $5, $6, $7, $8, $9, $10, $11, 'new', NOW()
        )
        ON CONFLICT (lead_id) DO UPDATE SET
          qualification_score = EXCLUDED.qualification_score,
          interest_level = EXCLUDED.interest_level,
          budget_range = EXCLUDED.budget_range,
          timeline_days = EXCLUDED.timeline_days,
          decision_maker = EXCLUDED.decision_maker,
          pain_points = EXCLUDED.pain_points,
          next_steps = EXCLUDED.next_steps,
          ai_summary = EXCLUDED.ai_summary,
          recommended_action = EXCLUDED.recommended_action,
          updated_at = NOW()
      `, [
                input.leadId,
                input.campaignId,
                analysis.qualification_score,
                analysis.interest_level,
                analysis.budget_range,
                analysis.timeline_days,
                analysis.decision_maker,
                analysis.pain_points,
                analysis.next_steps,
                analysis.summary,
                analysis.recommended_action
            ]);
        }
        finally {
            client.release();
        }
    }
    async storeAnalysisError(input, error) {
        const client = await this.pool.connect();
        try {
            await client.query(`
        INSERT INTO analysis_errors (
          call_id, lead_id, campaign_id, error_message, error_details, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
                input.callId,
                input.leadId,
                input.campaignId,
                error.message,
                JSON.stringify({ stack: error.stack, input })
            ]);
        }
        catch (logError) {
            console.error('Failed to log analysis error:', logError);
        }
        finally {
            client.release();
        }
    }
    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    validateAction(action) {
        const validActions = ['qualify', 'disqualify', 'callback', 'followup', 'demo', 'proposal'];
        return validActions.includes(action) ? action : 'followup';
    }
    validatePriority(priority) {
        const validPriorities = ['low', 'medium', 'high'];
        return validPriorities.includes(priority) ? priority : 'medium';
    }
    async getAnalysisStats(campaignId) {
        const client = await this.pool.connect();
        try {
            const whereClause = campaignId ? 'WHERE campaign_id = $1' : '';
            const params = campaignId ? [campaignId] : [];
            const statsResult = await client.query(`
        SELECT 
          COUNT(*) as total_analyzed,
          COUNT(*) FILTER (WHERE qualification_score >= 70) as qualified_leads,
          AVG(qualification_score) as average_score,
          (COUNT(*) FILTER (WHERE qualification_score >= 70)::float / COUNT(*) * 100) as qualification_rate
        FROM vapi_call_transcripts vct
        JOIN vapi_call_attempts vca ON vca.vapi_call_id = vct.vapi_call_id
        ${whereClause}
        AND vct.created_at > NOW() - INTERVAL '30 days'
      `, params);
            const stats = statsResult.rows[0];
            return {
                total_analyzed: parseInt(stats.total_analyzed),
                qualified_leads: parseInt(stats.qualified_leads),
                average_score: parseFloat(stats.average_score) || 0,
                qualification_rate: parseFloat(stats.qualification_rate) || 0,
                common_objections: [],
                top_pain_points: []
            };
        }
        finally {
            client.release();
        }
    }
    async reAnalyzeCall(callId) {
        const client = await this.pool.connect();
        try {
            const callResult = await client.query(`
        SELECT 
          vct.transcript, vct.recording_url, vct.vapi_call_id,
          vca.lead_id, vca.campaign_id, vca.duration_seconds
        FROM vapi_call_transcripts vct
        JOIN vapi_call_attempts vca ON vca.vapi_call_id = vct.vapi_call_id
        WHERE vct.vapi_call_id = $1
      `, [callId]);
            if (callResult.rows.length === 0) {
                throw new Error('Call not found');
            }
            const callData = callResult.rows[0];
            return await this.analyzeCall({
                callId: callData.vapi_call_id,
                transcript: callData.transcript,
                duration: callData.duration_seconds,
                recordingUrl: callData.recording_url,
                leadId: callData.lead_id,
                campaignId: callData.campaign_id
            });
        }
        finally {
            client.release();
        }
    }
}
exports.CallAnalysisService = CallAnalysisService;
