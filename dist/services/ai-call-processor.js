"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processCallWithAI = processCallWithAI;
const supabase_client_1 = __importDefault(require("./supabase-client"));
const ai_lead_qualification_1 = require("./ai-lead-qualification");
const axios_1 = __importDefault(require("axios"));
async function processCallWithAI(callId, vapiCallData) {
    console.log(`🤖 Processing call ${callId} with AI...`);
    try {
        const { data: call, error: callError } = await supabase_client_1.default
            .from('calls')
            .select('*')
            .eq('id', callId)
            .single();
        if (callError || !call) {
            console.error('❌ Call not found:', callError);
            return;
        }
        const analysisResult = await analyzeTranscript(vapiCallData);
        const updateData = {
            outcome: analysisResult.outcome,
            sentiment: analysisResult.sentiment,
            summary: analysisResult.summary || vapiCallData.summary,
            key_points: analysisResult.keyPoints,
            buying_signals: analysisResult.buyingSignals,
            ai_confidence_score: analysisResult.confidenceScore,
            contact_info: analysisResult.contactInfo,
            is_qualified_lead: analysisResult.isQualifiedLead,
            updated_at: new Date().toISOString()
        };
        if (analysisResult.contactInfo) {
            if (analysisResult.contactInfo.address || analysisResult.contactInfo.postcode) {
                const addressParts = [];
                if (analysisResult.contactInfo.address)
                    addressParts.push(analysisResult.contactInfo.address);
                if (analysisResult.contactInfo.postcode)
                    addressParts.push(analysisResult.contactInfo.postcode);
                updateData.address = addressParts.join(', ');
            }
            if (analysisResult.contactInfo.email) {
                updateData.customer_email = analysisResult.contactInfo.email;
            }
            if (analysisResult.contactInfo.company) {
                updateData.company = analysisResult.contactInfo.company;
            }
        }
        if (analysisResult.appointment) {
            const appointmentDetails = [];
            if (analysisResult.appointment.date)
                appointmentDetails.push(`Date: ${analysisResult.appointment.date}`);
            if (analysisResult.appointment.time)
                appointmentDetails.push(`Time: ${analysisResult.appointment.time}`);
            if (appointmentDetails.length > 0) {
                updateData.appointment_details = appointmentDetails.join(', ');
            }
        }
        if (analysisResult.qualificationDetails) {
            updateData.qualification_details = analysisResult.qualificationDetails;
        }
        if (analysisResult.questions) {
            updateData.questions_asked = analysisResult.questions;
        }
        if (analysisResult.objections) {
            updateData.objections_raised = analysisResult.objections;
        }
        if (analysisResult.nextSteps) {
            updateData.next_steps = analysisResult.nextSteps;
        }
        updateData.status = 'completed';
        const { error: updateError } = await supabase_client_1.default
            .from('calls')
            .update(updateData)
            .eq('id', callId);
        if (updateError) {
            console.error('❌ Error updating call with AI analysis:', updateError);
            return;
        }
        console.log(`✅ AI analysis complete for call ${callId}:`);
        console.log(`   Outcome: ${analysisResult.outcome}`);
        console.log(`   Qualified Lead: ${analysisResult.isQualifiedLead ? 'Yes' : 'No'}`);
        await ai_lead_qualification_1.AILeadQualificationService.processCallQualification({
            id: callId,
            duration: vapiCallData.duration,
            outcome: analysisResult.outcome,
            sentiment: analysisResult.sentiment,
            summary: analysisResult.summary,
            key_points: analysisResult.keyPoints,
            buying_signals: analysisResult.buyingSignals,
            ai_confidence_score: analysisResult.confidenceScore
        });
        if (analysisResult.isQualifiedLead) {
            const phone = analysisResult.contactInfo?.phone || call.customer_phone;
            if (!phone) {
                console.error(`❌ Cannot create lead for qualified call ${call.id} - missing phone number`);
                console.log('   Call data:', { customer_phone: call.customer_phone, contact_info: call.contact_info });
                console.log('   Analysis data:', analysisResult.contactInfo);
                await supabase_client_1.default
                    .from('calls')
                    .update({
                    crm_status: 'missing_phone_number',
                    notes: 'Qualified lead but missing phone number - cannot create CRM entry'
                })
                    .eq('id', callId);
            }
            else {
                await createCRMEntry(call, analysisResult.contactInfo || {}, analysisResult);
            }
        }
        console.log(`✅ AI processing complete for call ${callId}`);
    }
    catch (error) {
        console.error('❌ Error processing call with AI:', error);
        throw error;
    }
}
async function analyzeTranscript(vapiCall) {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
        console.warn('⚠️ OpenAI API key not configured, using basic analysis');
        return basicAnalysis(vapiCall);
    }
    try {
        const response = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4-turbo-preview',
            messages: [
                {
                    role: 'system',
                    content: `You are an expert AI sales analyst. Analyze call transcripts thoroughly to extract ALL available information about the prospect.
            
            Extract the following information:
            1. Contact information - Try to identify:
               - Full name (first and last)
               - Email address
               - Phone number (if mentioned)
               - Company/organization name
               - Job title/role
               - Company size
               - Industry
            
            2. Lead qualification details:
               - Interest level (1-10)
               - Buying signals (specific phrases indicating purchase intent)
               - Pain points/challenges they mentioned
               - Current solution they're using
               - Budget (if mentioned)
               - Timeline/urgency
               - Decision-making authority
               - Competitors mentioned
            
            3. Call outcome and next steps:
               - Outcome (interested, not_interested, callback_requested, voicemail, no_answer)
               - Sentiment (positive, neutral, negative)
               - Specific objections raised
               - Questions they asked
               - Features/benefits they were interested in
               - Next action items
               - Best time to follow up
            
            4. Additional insights:
               - Any personal details mentioned (for rapport building)
               - Preferred communication method
               - Key decision criteria
               - Team members involved in decision
            
            Be thorough but only include information explicitly mentioned or strongly implied in the conversation.
            For any field without information, leave it empty rather than guessing.
            
            Return a JSON object with these fields:
            {
              "contactInfo": { 
                "name": "", 
                "email": "", 
                "phone": "", 
                "company": "",
                "jobTitle": "",
                "companySize": "",
                "industry": "",
                "address": "",
                "postcode": ""
              },
              "appointment": {
                "date": "",
                "time": ""
              },
              "qualificationDetails": {
                "interestLevel": 0,
                "painPoints": [],
                "currentSolution": "",
                "budget": "",
                "timeline": "",
                "decisionAuthority": "",
                "competitors": []
              },
              "outcome": "",
              "sentiment": "",
              "summary": "",
              "keyPoints": [],
              "buyingSignals": [],
              "objections": [],
              "questions": [],
              "nextSteps": [],
              "followUpNotes": "",
              "confidenceScore": 0.0,
              "isQualifiedLead": false
            }`
                },
                {
                    role: 'user',
                    content: `Analyze this call transcript and data:
            
            Transcript: ${vapiCall.transcript || 'No transcript available'}
            Duration: ${vapiCall.duration} seconds
            Summary: ${vapiCall.summary || 'No summary'}
            Customer: ${JSON.stringify(vapiCall.customer || {})}
            Analysis: ${JSON.stringify(vapiCall.analysis || {})}`
                }
            ],
            response_format: { type: "json_object" },
            temperature: 0.3,
            max_tokens: 1000
        }, {
            headers: {
                'Authorization': `Bearer ${openaiApiKey}`,
                'Content-Type': 'application/json'
            }
        });
        const analysis = response.data.choices[0].message.content;
        return JSON.parse(analysis);
    }
    catch (error) {
        console.error('❌ OpenAI API error:', error);
        return basicAnalysis(vapiCall);
    }
}
function basicAnalysis(vapiCall) {
    const duration = vapiCall.duration || 0;
    const hasTranscript = !!vapiCall.transcript;
    const sentiment = vapiCall.analysis?.userSentiment || 'neutral';
    let confidenceScore = 0.5;
    if (duration > 120)
        confidenceScore += 0.2;
    if (hasTranscript)
        confidenceScore += 0.1;
    if (sentiment === 'positive')
        confidenceScore += 0.2;
    const isQualifiedLead = confidenceScore >= 0.7;
    return {
        contactInfo: {
            name: vapiCall.customer?.name || '',
            phone: vapiCall.customer?.number || '',
            email: '',
            company: ''
        },
        outcome: duration > 30 ? 'interested' : 'not_interested',
        sentiment: sentiment,
        summary: vapiCall.summary || `Call lasted ${duration} seconds`,
        keyPoints: vapiCall.analysis?.summary ? [vapiCall.analysis.summary] : [],
        buyingSignals: [],
        confidenceScore: confidenceScore,
        isQualifiedLead: isQualifiedLead
    };
}
async function createCRMEntry(call, contactInfo, analysis) {
    try {
        const { data: existingLead } = await supabase_client_1.default
            .from('leads')
            .select('id')
            .eq('phone', contactInfo.phone)
            .eq('organization_id', call.organization_id)
            .single();
        if (existingLead) {
            console.log(`📋 Lead already exists: ${existingLead.id}`);
            return;
        }
        const phone = contactInfo.phone || call.customer_phone;
        if (!phone) {
            console.error(`❌ Cannot create lead - no phone number available`);
            return;
        }
        const leadData = {
            organization_id: call.organization_id,
            first_name: contactInfo.name?.split(' ')[0] || call.customer_name?.split(' ')[0] || 'Unknown',
            last_name: contactInfo.name?.split(' ').slice(1).join(' ') || call.customer_name?.split(' ').slice(1).join(' ') || '',
            phone: phone,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        if (call.campaign_id)
            leadData.campaign_id = call.campaign_id;
        if (contactInfo.email)
            leadData.email = contactInfo.email;
        if (contactInfo.company)
            leadData.company = contactInfo.company;
        if (contactInfo.address || contactInfo.postcode) {
            const addressParts = [];
            if (contactInfo.address)
                addressParts.push(contactInfo.address);
            if (contactInfo.postcode)
                addressParts.push(contactInfo.postcode);
            leadData.address = addressParts.join(', ');
        }
        leadData.status = 'qualified';
        leadData.score = Math.round(analysis.confidenceScore * 100);
        const qualDetails = analysis.qualificationDetails || {};
        leadData.notes = `AI Qualified Lead Analysis
        
📊 LEAD SCORE: ${Math.round(analysis.confidenceScore * 100)}%
Interest Level: ${qualDetails.interestLevel || 'Unknown'}/10

📋 CONTACT DETAILS:
• Name: ${contactInfo.name || 'Not provided'}
• Email: ${contactInfo.email || 'Not provided'}
• Phone: ${contactInfo.phone || call.customer_phone || 'Not provided'}
• Company: ${contactInfo.company || 'Not provided'}
• Job Title: ${contactInfo.jobTitle || 'Not provided'}
• Company Size: ${contactInfo.companySize || 'Not provided'}
• Industry: ${contactInfo.industry || 'Not provided'}

💡 QUALIFICATION INSIGHTS:
${qualDetails.painPoints?.length > 0 ? `• Pain Points: ${qualDetails.painPoints.join(', ')}` : ''}
${qualDetails.currentSolution ? `• Current Solution: ${qualDetails.currentSolution}` : ''}
${qualDetails.budget ? `• Budget: ${qualDetails.budget}` : ''}
${qualDetails.timeline ? `• Timeline: ${qualDetails.timeline}` : ''}
${qualDetails.decisionAuthority ? `• Decision Authority: ${qualDetails.decisionAuthority}` : ''}
${qualDetails.competitors?.length > 0 ? `• Competitors Mentioned: ${qualDetails.competitors.join(', ')}` : ''}

📝 CONVERSATION SUMMARY:
${analysis.summary}

🎯 KEY POINTS:
${analysis.keyPoints?.map(point => `• ${point}`).join('\n') || 'None identified'}

✅ BUYING SIGNALS:
${analysis.buyingSignals?.map(signal => `• ${signal}`).join('\n') || 'None detected'}

❓ QUESTIONS ASKED:
${analysis.questions?.map(q => `• ${q}`).join('\n') || 'None'}

⚠️ OBJECTIONS:
${analysis.objections?.map(obj => `• ${obj}`).join('\n') || 'None raised'}

📅 NEXT STEPS:
${analysis.nextSteps?.map(step => `• ${step}`).join('\n') || 'No specific next steps identified'}

📞 FOLLOW-UP NOTES:
${analysis.followUpNotes || 'No specific follow-up notes'}

🔊 Call Details:
• Call ID: ${call.id}
• Duration: ${vapiCallData.duration} seconds
• Outcome: ${analysis.outcome}
• Sentiment: ${analysis.sentiment}`;
        const { data: newLead, error } = await supabase_client_1.default
            .from('leads')
            .insert(leadData)
            .select()
            .single();
        if (error) {
            console.error('❌ Error creating CRM lead:', error);
            return;
        }
        console.log(`✅ Created CRM lead: ${newLead.id}`);
        await supabase_client_1.default
            .from('calls')
            .update({
            lead_id: newLead.id,
            crm_status: 'added_to_crm'
        })
            .eq('id', call.id);
    }
    catch (error) {
        console.error('❌ Error creating CRM entry:', error);
    }
}
