"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processCallWithEnhancedAI = exports.EnhancedAIProcessor = void 0;
const supabase_client_1 = __importDefault(require("./supabase-client"));
const axios_1 = __importDefault(require("axios"));
const ultra_detailed_brief_generator_1 = __importDefault(require("./ultra-detailed-brief-generator"));
class EnhancedAIProcessor {
    static async processCall(callId, transcript, vapiData) {
        console.log(`🤖 Enhanced AI processing for call ${callId}...`);
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
            const extracted = await this.extractWithGPT4(transcript, vapiData);
            let ultraDetailedBrief = null;
            if (extracted.isQualifiedLead || extracted.interestLevel >= 5) {
                console.log('📊 Generating ultra-detailed brief...');
                ultraDetailedBrief = await ultra_detailed_brief_generator_1.default.generateBrief(transcript, vapiData, call);
                call.ultra_detailed_brief = ultraDetailedBrief;
                if (ultraDetailedBrief.calendar?.appointments?.length > 0) {
                    await this.createAppointments(call, ultraDetailedBrief.calendar.appointments);
                }
                if (ultraDetailedBrief.actionItems?.tasksToDo?.length > 0) {
                    await this.createTasks(call, ultraDetailedBrief.actionItems.tasksToDo);
                }
            }
            await this.updateCallRecord(callId, extracted, ultraDetailedBrief);
            if (extracted.isQualifiedLead) {
                console.log(`✅ Creating/updating lead - Interest level: ${extracted.interestLevel}/10`);
                await this.createOrUpdateLead(call, extracted, ultraDetailedBrief);
            }
            else {
                console.log(`⚠️ Not creating lead - Interest level: ${extracted.interestLevel || 'unknown'}/10, Qualified: false`);
                console.log(`   Reasons: ${extracted.sentiment === 'negative' ? 'Negative sentiment' : 'Low interest or explicit disinterest'}`);
            }
            if (extracted.nextSteps && extracted.nextSteps.length > 0) {
                await this.createFollowUpTasks(callId, extracted.nextSteps);
            }
            console.log(`✅ Enhanced processing complete for call ${callId}`);
            return extracted;
        }
        catch (error) {
            console.error('❌ Error in enhanced AI processing:', error);
            throw error;
        }
    }
    static async extractWithGPT4(transcript, vapiData) {
        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!openaiApiKey) {
            console.warn('⚠️ OpenAI API key not configured');
            return this.basicExtraction(transcript, vapiData);
        }
        console.log('🤖 Calling GPT-4 for extraction...');
        try {
            const response = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4-turbo-preview',
                messages: [
                    {
                        role: 'system',
                        content: `You are an expert AI sales analyst. Extract ALL available information from the call transcript. Scan for EVERY possible field and populate what you find, leaving null what's not mentioned.
              
              CRITICAL: Distinguish between:
              1. THE PROSPECT (person being called) - their personal info and employer
              2. THE CALLING COMPANY (who's selling) - the company making the sales call
              
              EXTRACT ALL CONTACT FIELDS (populate what exists, leave null if not mentioned):
              - firstName: First name of prospect
              - lastName: Last name of prospect  
              - fullName: Complete name if mentioned together
              - email: Email address (any @domain format)
              - phone: Primary phone number in any format
              - alternativePhone: Any other phone numbers mentioned
              
              EXTRACT ALL ADDRESS FIELDS (each component separately):
              - address: Street address line 1 (e.g., "123 Main Street")
              - addressLine2: Apartment, suite, unit number
              - city: City name
              - state: State or region
              - postcode: ZIP or postal code
              - country: Country if mentioned
              
              EXTRACT PROFESSIONAL INFO:
              - company: Where the PROSPECT works (their employer - often NOT mentioned)
              - jobTitle: Prospect's role/position at their company
              - department: Department or division
              - industry: Industry sector of prospect's company
              - companySize: Number of employees if mentioned
              - website: Company website if mentioned
              
              EXTRACT LEAD TRACKING DATA:
              - leadSource: How they heard about us or came to be called
              - referralSource: Who referred them if mentioned
              - previousInteraction: Any mention of prior contact
              - campaignResponse: Which marketing campaign they responded to
              
              EXTRACT QUALIFICATION METRICS:
              - interestLevel: Rate 1-10 (1-3=low, 4-6=medium, 7-10=high)
              - budget: Budget amount or range mentioned
              - timeline: When they plan to buy/implement
              - decisionAuthority: Who makes the decision
              - painPoints: Array of problems/needs mentioned
              - currentSolution: What they use now
              - competitors: Array of competitors mentioned or considered
              
              EXTRACT CONVERSION DATA:
              - converted: Did they agree to buy/sign up? (true/false)
              - conversionDate: When they agreed to convert
              - conversionValue: Dollar value of conversion if mentioned
              - nextCallDate: When to call back
              - lastCallDate: This call's date
              
              EXTRACT CALLING COMPANY INFO:
              - callingCompany: Name of company making the sales call
              - callingCompanyService: Product/service being sold
              - callingCompanyRep: Sales rep's name
              - callingCompanyPhone: Their contact number
              
              APPOINTMENT INFORMATION:
              - Date (specific date if mentioned)
              - Time (specific time or time preference like "evening", "after 6pm")
              - Day of week preference
              - Type (in-home consultation, phone call, video call)
              - Duration expected
              - Location (at their home, office, etc.)
              - Special instructions (e.g., "call before arriving", "park in driveway")
              
              BEHAVIORAL INSIGHTS:
              - Communication style (brief/detailed, formal/casual, skeptical/trusting)
              - Key concerns or objections (price, timing, trust, features)
              - What excited them most about the offering
              - Previous experience with similar products/services
              - How they heard about the company
              - Their knowledge level (beginner, informed, expert)
              
              DETERMINE IF QUALIFIED LEAD (isQualifiedLead = true only if):
              - Interest level >= 6 OR
              - Scheduled an appointment OR
              - Asked for pricing/proposal OR
              - Provided contact information willingly OR
              - Asked to be contacted again
              
              NOT QUALIFIED (isQualifiedLead = false) if:
              - Said "not interested" explicitly
              - Hung up immediately
              - Asked to be removed from list
              - Interest level <= 3
              
              CONVERSATION ANALYSIS:
              - Specific questions the prospect asked (verbatim if possible)
              - Objections or concerns raised (exact wording helps)
              - Buying signals (e.g., "when can you start", "what's the next step")
              - Next steps agreed upon
              - Any special requests or preferences mentioned
              - Sentiment throughout call (positive/negative/neutral/mixed)
              
              EXTRACT VERBATIM QUOTES when prospect mentions:
              - Scheduling preferences
              - Budget constraints
              - Decision timeline
              - Specific needs or requirements
              
              Return a JSON object with all extracted information. Be VERY careful to correctly identify who is the seller vs the prospect!`
                    },
                    {
                        role: 'user',
                        content: `Analyze this call transcript and extract ALL information:\n\n${transcript}\n\nVAPI Data: ${JSON.stringify(vapiData)}`
                    }
                ],
                temperature: 0.3,
                response_format: { type: "json_object" }
            }, {
                headers: {
                    'Authorization': `Bearer ${openaiApiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log('✅ GPT-4 response received');
            const extracted = response.data.choices[0].message.content;
            console.log('📝 Raw GPT-4 response:', extracted.substring(0, 500) + '...');
            const parsed = JSON.parse(extracted);
            console.log('📊 Extracted data - Interest:', parsed.interestLevel, 'Qualified:', parsed.isQualifiedLead);
            return this.normalizeExtractedData(parsed);
        }
        catch (error) {
            console.error('❌ GPT-4 extraction failed:', error.response?.data || error.message);
            console.log('⚠️ Falling back to basic extraction');
            return this.basicExtraction(transcript, vapiData);
        }
    }
    static basicExtraction(transcript, vapiData) {
        const result = {
            sentiment: 'neutral',
            confidenceScore: 0.5,
            isQualifiedLead: false
        };
        const lowerTranscript = transcript.toLowerCase();
        if (lowerTranscript.includes('interested'))
            result.interestLevel = 7;
        if (lowerTranscript.includes('very interested'))
            result.interestLevel = 9;
        if (lowerTranscript.includes('not interested'))
            result.interestLevel = 2;
        const budgetMatch = lowerTranscript.match(/budget.*?(\$[\d,]+|\d+k|\d+ thousand)/);
        if (budgetMatch)
            result.budget = budgetMatch[1];
        const timelinePatterns = ['next week', 'next month', 'this quarter', 'asap', 'immediately'];
        for (const pattern of timelinePatterns) {
            if (lowerTranscript.includes(pattern)) {
                result.timeline = pattern;
                break;
            }
        }
        const emailMatch = transcript.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch)
            result.email = emailMatch[0];
        const phoneMatch = transcript.match(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/);
        if (phoneMatch)
            result.phone = phoneMatch[0];
        result.isQualifiedLead = (result.interestLevel || 0) >= 6;
        if (lowerTranscript.includes('not interested') ||
            lowerTranscript.includes('remove me') ||
            lowerTranscript.includes('take me off')) {
            result.isQualifiedLead = false;
            result.interestLevel = Math.min(result.interestLevel || 0, 3);
        }
        if (lowerTranscript.includes('appointment') ||
            lowerTranscript.includes('schedule') ||
            lowerTranscript.includes('pricing') ||
            lowerTranscript.includes('proposal') ||
            lowerTranscript.includes('call me back') ||
            lowerTranscript.includes('friday') && lowerTranscript.includes('6 pm') ||
            lowerTranscript.includes('that sounds good') ||
            lowerTranscript.includes('that sounds reasonable')) {
            result.isQualifiedLead = true;
            result.interestLevel = Math.max(result.interestLevel || 5, 7);
        }
        return result;
    }
    static normalizeExtractedData(data) {
        const prospect = data.PROSPECT_INFORMATION || data.prospect || data;
        const calling = data.CALLING_COMPANY || data.callingCompany || {};
        const qualification = data.QUALIFICATION_DETAILS || data.qualification || {};
        const appointment = data.APPOINTMENT_INFORMATION || data.appointment || {};
        const behavioral = data.BEHAVIORAL_INSIGHTS || data.behavioral || {};
        const conversation = data.CONVERSATION_ANALYSIS || data.conversation || {};
        const tracking = data.LEAD_TRACKING || data.tracking || {};
        const conversion = data.CONVERSION_DATA || data.conversion || {};
        return {
            fullName: prospect['Full name'] || prospect.fullName || data.fullName || data.name,
            firstName: prospect['First name'] || prospect.firstName || data.firstName,
            lastName: prospect['Last name'] || prospect.lastName || data.lastName,
            email: prospect['Email address'] || prospect.email || data.email,
            phone: prospect['Phone number'] || prospect.phone || data.phone,
            alternativePhone: prospect.alternativePhone || data.alternativePhone,
            address: prospect['Complete address']?.Street || prospect.address || data.address,
            addressLine2: prospect.addressLine2 || data.addressLine2,
            city: prospect['Complete address']?.City || prospect.city || data.city,
            state: prospect['Complete address']?.['State/Region'] || prospect.state || data.state,
            postcode: prospect['Complete address']?.Postcode || prospect.postcode || data.postcode,
            country: prospect['Complete address']?.Country || prospect.country || data.country,
            company: prospect['Employer/Company'] || prospect.company || data.company,
            jobTitle: prospect['Job title/Role'] || prospect.jobTitle || data.jobTitle,
            department: prospect.department || data.department,
            companySize: data.companySize || data.employeeCount,
            industry: data.industry || data.sector,
            website: data.website || data.companyWebsite,
            leadSource: tracking.leadSource || data.leadSource,
            referralSource: tracking.referralSource || data.referralSource,
            previousInteraction: tracking.previousInteraction || data.previousInteraction,
            campaignResponse: tracking.campaignResponse || data.campaignResponse,
            callingCompany: calling['Company name'] || calling.name || data.callingCompany,
            callingCompanyService: calling['Service/product'] || calling.service || data.callingCompanyService,
            callingCompanyRep: calling['Sales rep name'] || calling.rep || data.callingCompanyRep,
            callingCompanyPhone: calling['Contact number'] || calling.phone || data.callingCompanyPhone,
            interestLevel: qualification['Interest level'] || qualification.interestLevel || data.interestLevel,
            budget: qualification.Budget || qualification.budget || data.budget,
            timeline: qualification.Timeline || qualification.timeline || data.timeline,
            decisionAuthority: qualification['Decision-making authority'] || qualification.decisionAuthority || data.decisionAuthority,
            painPoints: qualification['Pain points'] || Array.isArray(data.painPoints) ? data.painPoints : [],
            currentSolution: qualification['Current solution'] || data.currentSolution,
            competitors: qualification.Competitors || Array.isArray(data.competitors) ? data.competitors : [],
            converted: conversion.converted || data.converted || false,
            conversionDate: conversion.conversionDate || data.conversionDate,
            conversionValue: conversion.conversionValue || data.conversionValue,
            nextCallDate: conversion.nextCallDate || data.nextCallDate,
            lastCallDate: conversion.lastCallDate || data.lastCallDate || new Date().toISOString(),
            questions: conversation['Questions asked'] || Array.isArray(data.questions) ? data.questions : [],
            objections: conversation['Objections raised'] || Array.isArray(data.objections) ? data.objections : [],
            buyingSignals: conversation['Buying signals'] || Array.isArray(data.buyingSignals) ? data.buyingSignals : [],
            nextSteps: conversation['Next steps'] || Array.isArray(data.nextSteps) ? data.nextSteps : [],
            appointmentDate: appointment.Date || appointment.date || data.appointmentDate,
            appointmentTime: appointment.Time || appointment.time || data.appointmentTime,
            appointmentType: appointment.Type || appointment.type || data.appointmentType,
            summary: conversation.Summary || data.summary,
            keyPoints: Array.isArray(data.keyPoints) ? data.keyPoints : [],
            followUpNotes: data.followUpNotes,
            sentiment: conversation.Sentiment || behavioral['Communication style'] || data.sentiment || 'neutral',
            outcome: data.outcome,
            confidenceScore: data.confidenceScore || 0.7,
            isQualifiedLead: data.QUALIFIED === true || data.isQualifiedLead === true || data.qualified === true || qualification['Qualified'] === true
        };
    }
    static async createAppointments(call, appointments) {
        for (const apt of appointments) {
            try {
                const { error } = await supabase_client_1.default
                    .from('appointments')
                    .insert({
                    organization_id: call.organization_id,
                    lead_id: call.lead_id,
                    campaign_id: call.campaign_id,
                    call_id: call.id,
                    type: apt.type || 'callback',
                    title: apt.agenda || `${apt.type} with lead`,
                    description: apt.preparationNotes,
                    date: apt.date,
                    time: apt.time,
                    duration_minutes: parseInt(apt.duration) || 30,
                    location_type: apt.location ? 'in_person' : 'phone',
                    location_details: { location: apt.location },
                    agenda: apt.agenda,
                    preparation_notes: apt.preparationNotes,
                    status: apt.confirmed ? 'confirmed' : 'scheduled',
                    confirmation_status: apt.confirmed ? 'confirmed' : 'pending'
                });
                if (!error) {
                    console.log(`📅 Created appointment: ${apt.type} on ${apt.date} at ${apt.time}`);
                }
                else {
                    console.error('Error creating appointment:', error);
                }
            }
            catch (err) {
                console.error('Failed to create appointment:', err);
            }
        }
    }
    static async createTasks(call, tasks) {
        for (const task of tasks) {
            try {
                const { error } = await supabase_client_1.default
                    .from('tasks')
                    .insert({
                    organization_id: call.organization_id,
                    lead_id: call.lead_id,
                    call_id: call.id,
                    title: task.task,
                    description: `Auto-generated task from call ${call.id}`,
                    category: 'follow_up',
                    priority: task.priority || 'medium',
                    due_date: task.deadline || new Date(Date.now() + 86400000).toISOString().split('T')[0],
                    status: 'pending'
                });
                if (!error) {
                    console.log(`✅ Created task: ${task.task}`);
                }
                else {
                    console.error('Error creating task:', error);
                }
            }
            catch (err) {
                console.error('Failed to create task:', err);
            }
        }
    }
    static async updateCallRecord(callId, extracted, ultraBrief) {
        const updateData = {
            status: 'completed',
            outcome: extracted.outcome || 'completed',
            sentiment: extracted.sentiment,
            summary: extracted.summary,
            key_points: extracted.keyPoints,
            buying_signals: extracted.buyingSignals,
            ai_confidence_score: extracted.confidenceScore,
            is_qualified_lead: extracted.isQualifiedLead,
            customer_email: extracted.email,
            customer_company: extracted.company,
            metadata: {
                questions_asked: extracted.questions,
                objections_raised: extracted.objections,
                appointment_details: extracted.appointmentDate ? {
                    date: extracted.appointmentDate,
                    time: extracted.appointmentTime,
                    type: extracted.appointmentType
                } : null,
                ultra_detailed_brief: ultraBrief || null,
                notes: this.generateDetailedNotes(extracted)
            },
            next_steps: extracted.nextSteps,
            objections: extracted.objections,
            updated_at: new Date().toISOString()
        };
        const { error } = await supabase_client_1.default
            .from('calls')
            .update(updateData)
            .eq('id', callId);
        if (error) {
            console.error('❌ Error updating call record:', error);
        }
        else {
            console.log(`✅ Call record updated with comprehensive extraction`);
        }
    }
    static async createOrUpdateLead(call, extracted, ultraBrief) {
        const phone = extracted.phone || call.customer_phone;
        if (!phone) {
            console.error('❌ Cannot create lead without phone number');
            return;
        }
        const { data: existingLead } = await supabase_client_1.default
            .from('leads')
            .select('id')
            .eq('phone', phone)
            .eq('organization_id', call.organization_id)
            .single();
        let assignedTo = null;
        const { data: campaign } = await supabase_client_1.default
            .from('campaigns')
            .select('created_by')
            .eq('id', call.campaign_id)
            .single();
        if (campaign?.created_by) {
            assignedTo = campaign.created_by;
        }
        else {
            const { data: org } = await supabase_client_1.default
                .from('organizations')
                .select('owner_id')
                .eq('id', call.organization_id)
                .single();
            assignedTo = org?.owner_id || null;
        }
        const leadData = {
            organization_id: call.organization_id,
            campaign_id: call.campaign_id,
            call_id: call.id,
            uploaded_by: call.created_by || null,
            first_name: extracted.firstName || extracted.fullName?.split(' ')[0] || '',
            last_name: extracted.lastName || extracted.fullName?.split(' ').slice(1).join(' ') || '',
            email: extracted.email || '',
            phone: phone,
            company: extracted.company || '',
            job_title: extracted.jobTitle || '',
            address_line1: extracted.address || '',
            address_line2: extracted.addressLine2 || '',
            city: extracted.city || '',
            state: extracted.state || '',
            postal_code: extracted.postcode || '',
            country: extracted.country || '',
            lead_source: extracted.leadSource || 'campaign_call',
            lead_quality: extracted.interestLevel >= 7 ? 'high' :
                extracted.interestLevel >= 5 ? 'medium' :
                    extracted.interestLevel >= 3 ? 'low' : 'cold',
            status: 'qualified',
            qualification_status: 'qualified',
            score: Math.round((extracted.interestLevel || 5) * 10),
            call_status: 'completed',
            call_attempts: 1,
            last_call_at: new Date().toISOString(),
            next_call_at: extracted.nextCallDate || null,
            converted: extracted.converted || false,
            conversion_date: extracted.conversionDate || null,
            conversion_value: extracted.conversionValue || null,
            phone_validated: !!phone,
            email_validated: !!extracted.email,
            data_quality_score: this.calculateDataQualityScore(extracted),
            custom_fields: {
                assigned_to: assignedTo || 'Auto-assigned',
                assigned_at: assignedTo ? new Date().toISOString() : null,
                interest_level: extracted.interestLevel,
                address: {
                    street: extracted.address || '',
                    city: extracted.city || '',
                    state: extracted.state || '',
                    zipCode: extracted.postcode || '',
                    country: extracted.country || ''
                },
                calling_company: {
                    name: extracted.callingCompany,
                    service: extracted.callingCompanyService,
                    representative: extracted.callingCompanyRep,
                    contact_number: extracted.callingCompanyPhone
                },
                interest_level: extracted.interestLevel,
                budget: extracted.budget,
                timeline: extracted.timeline,
                decision_authority: extracted.decisionAuthority,
                pain_points: extracted.painPoints,
                current_solution: extracted.currentSolution,
                competitors: extracted.competitors,
                appointment: extracted.appointmentDate ? {
                    date: extracted.appointmentDate,
                    time: extracted.appointmentTime,
                    type: extracted.appointmentType
                } : null,
                industry: extracted.industry,
                company_size: extracted.companySize,
                website: extracted.website,
                questions_asked: extracted.questions,
                objections_raised: extracted.objections,
                buying_signals: extracted.buyingSignals,
                next_steps: extracted.nextSteps,
                sentiment: extracted.sentiment,
                confidence_score: extracted.confidenceScore,
                notes: [{
                        id: `ai-note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        content: this.generateCallSummary(extracted),
                        createdBy: 'AI System',
                        createdAt: new Date().toISOString(),
                        lastUpdated: new Date().toISOString(),
                        tag: 'ai-summary'
                    }],
                ultraDetailedBrief: ultraBrief || null,
                missingInfo: ultraBrief?.actionItems?.missingInfo || [],
                upcomingAppointments: ultraBrief?.calendar?.appointments || [],
                pendingTasks: ultraBrief?.actionItems?.tasksToDo || [],
                nextBestAction: ultraBrief?.aiRecommendations?.nextBestAction || null,
                winProbability: ultraBrief?.aiRecommendations?.winProbability || null
            },
            updated_at: new Date().toISOString()
        };
        if (existingLead) {
            const { data: currentLead } = await supabase_client_1.default
                .from('leads')
                .select('custom_fields')
                .eq('id', existingLead.id)
                .single();
            if (currentLead?.custom_fields) {
                const newNote = {
                    id: `ai-note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    content: this.generateCallSummary(extracted),
                    createdBy: 'AI System',
                    createdAt: new Date().toISOString(),
                    lastUpdated: new Date().toISOString(),
                    tag: 'ai-summary'
                };
                leadData.custom_fields = {
                    ...currentLead.custom_fields,
                    ...leadData.custom_fields,
                    notes: [newNote]
                };
            }
            leadData.status = 'qualified';
            leadData.qualification_status = 'qualified';
            const { error } = await supabase_client_1.default
                .from('leads')
                .update(leadData)
                .eq('id', existingLead.id);
            if (error) {
                console.error('❌ Error updating lead:', error);
            }
            else {
                console.log(`✅ Lead updated: ${existingLead.id}`);
            }
        }
        else {
            leadData.created_at = new Date().toISOString();
            const { data: newLead, error } = await supabase_client_1.default
                .from('leads')
                .insert(leadData)
                .select()
                .single();
            if (error) {
                console.error('❌ Error creating lead:', error);
            }
            else {
                console.log(`✅ Lead created: ${newLead.id}`);
            }
        }
    }
    static async createFollowUpTasks(callId, nextSteps) {
        for (const step of nextSteps) {
            const taskData = {
                call_id: callId,
                description: step,
                status: 'pending',
                created_at: new Date().toISOString()
            };
            const { error } = await supabase_client_1.default
                .from('follow_up_tasks')
                .insert(taskData);
            if (error) {
                console.error('❌ Error creating follow-up task:', error);
            }
        }
        console.log(`✅ Created ${nextSteps.length} follow-up tasks`);
    }
    static formatAddress(extracted) {
        const parts = [];
        if (extracted.address)
            parts.push(extracted.address);
        if (extracted.city)
            parts.push(extracted.city);
        if (extracted.state)
            parts.push(extracted.state);
        if (extracted.postcode)
            parts.push(extracted.postcode);
        if (extracted.country)
            parts.push(extracted.country);
        return parts.join(', ');
    }
    static generateCallSummary(extracted) {
        const parts = [];
        const prospectName = extracted.firstName || extracted.fullName || 'Customer';
        const service = extracted.callingCompanyService || 'Consultation';
        parts.push(`Pre-Call Brief for ${prospectName} - ${service} Follow-Up`);
        parts.push(`\nCustomer Background:`);
        parts.push(`Name: ${extracted.fullName || extracted.firstName || 'Unknown'}`);
        const interestDesc = extracted.interestLevel >= 7 ? 'High interest' :
            extracted.interestLevel >= 5 ? 'Moderate interest' :
                'New to the offering';
        parts.push(`Interest Level: ${interestDesc} (${extracted.interestLevel || 'Unknown'}/10)`);
        parts.push(`Status: ${extracted.isQualifiedLead ? 'Qualified for consultation' : 'Needs further qualification'}`);
        parts.push(`\nAddress Information:`);
        parts.push(`Street Address: ${extracted.address || 'Not provided'}`);
        parts.push(`City: ${extracted.city || 'Not provided'}`);
        parts.push(`State: ${extracted.state || 'Not provided'}`);
        parts.push(`ZIP Code: ${extracted.postcode || 'Not provided'}`);
        parts.push(`Country: ${extracted.country || 'Not provided'}`);
        if (extracted.appointmentDate || extracted.appointmentTime) {
            parts.push(`\nAppointment Details:`);
            let appointmentStr = '';
            if (extracted.appointmentDate && extracted.appointmentTime) {
                appointmentStr = `${extracted.appointmentDate} at ${extracted.appointmentTime}`;
            }
            else if (extracted.appointmentDate) {
                appointmentStr = extracted.appointmentDate;
            }
            else if (extracted.appointmentTime) {
                appointmentStr = extracted.appointmentTime;
            }
            parts.push(`Scheduled: ${appointmentStr}`);
            parts.push(`Type: ${extracted.appointmentType || 'Free consultation'}`);
        }
        parts.push(`\nKey Points to Remember:`);
        if (extracted.painPoints && extracted.painPoints.length > 0) {
            parts.push(`- Customer needs: ${extracted.painPoints.join(', ')}`);
        }
        if (extracted.objections && extracted.objections.length > 0) {
            parts.push(`- Concerns raised: ${extracted.objections.join(', ')}`);
        }
        if (extracted.questions && extracted.questions.length > 0) {
            parts.push(`- Questions asked: ${extracted.questions.join(', ')}`);
        }
        if (extracted.currentSolution) {
            parts.push(`- Current solution: ${extracted.currentSolution}`);
        }
        if (extracted.timeline) {
            parts.push(`- Timeline: ${extracted.timeline}`);
        }
        if (extracted.budget) {
            parts.push(`- Budget: ${extracted.budget}`);
        }
        parts.push(`\nWhat to Prepare:`);
        if (!extracted.budget || extracted.budget.toLowerCase().includes('not sure')) {
            parts.push(`- Clear explanation of financing options`);
        }
        if (extracted.competitors && extracted.competitors.length > 0) {
            parts.push(`- Competitive comparison materials`);
        }
        if (extracted.painPoints && extracted.painPoints.length > 0) {
            parts.push(`- Solutions for specific needs discussed`);
        }
        parts.push(`- Energy bill analysis tools`);
        parts.push(`- Company credentials and testimonials`);
        parts.push(`\nCustomer Communication Style:`);
        if (extracted.sentiment === 'positive') {
            parts.push(`Engaged and receptive - ready to learn more`);
        }
        else if (extracted.sentiment === 'negative') {
            parts.push(`Skeptical - needs trust building and education`);
        }
        else {
            parts.push(`Neutral - needs more information`);
        }
        parts.push(`\nNotes for Approach:`);
        if (extracted.phone) {
            parts.push(`Confirm appointment via text to: ${extracted.phone}`);
        }
        if (extracted.email) {
            parts.push(`Send confirmation email to: ${extracted.email}`);
        }
        if (extracted.decisionAuthority) {
            parts.push(`Decision authority: ${extracted.decisionAuthority}`);
        }
        if (extracted.interestLevel && extracted.interestLevel < 5) {
            parts.push(`- Take educational approach, no pressure`);
            parts.push(`- Focus on building trust first`);
        }
        else if (extracted.interestLevel >= 7) {
            parts.push(`- Customer is ready to move forward`);
            parts.push(`- Have contract and payment options ready`);
        }
        else {
            parts.push(`- Balance information with soft close attempts`);
        }
        if (extracted.nextSteps && extracted.nextSteps.length > 0) {
            parts.push(`Next actions: ${extracted.nextSteps.join(', ')}`);
        }
        return parts.join('\n');
    }
    static generateDetailedNotes(extracted) {
        return this.generateCallSummary(extracted);
    }
    static calculateDataQualityScore(extracted) {
        let score = 0;
        let totalFields = 0;
        const essentialFields = [
            extracted.firstName || extracted.fullName,
            extracted.phone,
            extracted.email,
            extracted.city,
            extracted.state
        ];
        essentialFields.forEach(field => {
            totalFields += 2;
            if (field)
                score += 2;
        });
        const additionalFields = [
            extracted.lastName,
            extracted.address,
            extracted.postcode,
            extracted.country,
            extracted.company,
            extracted.jobTitle,
            extracted.interestLevel,
            extracted.budget,
            extracted.timeline,
            extracted.appointmentDate
        ];
        additionalFields.forEach(field => {
            totalFields += 1;
            if (field)
                score += 1;
        });
        return Math.round((score / totalFields) * 100);
    }
}
exports.EnhancedAIProcessor = EnhancedAIProcessor;
exports.processCallWithEnhancedAI = EnhancedAIProcessor.processCall.bind(EnhancedAIProcessor);
