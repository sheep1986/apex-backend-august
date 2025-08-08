"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AILeadProcessor = void 0;
const supabase_client_1 = __importDefault(require("./supabase-client"));
const email_service_1 = require("./email-service");
const notification_service_1 = require("./notification-service");
class AILeadProcessor {
    constructor() {
        this.emailService = new email_service_1.EmailService();
        this.notificationService = new notification_service_1.NotificationService();
    }
    async processAnalysis(analysis, callData) {
        console.log('🚀 Processing AI analysis for call:', callData.id);
        const result = {
            id: callData.id,
            actions: []
        };
        try {
            const lead = await this.createOrUpdateLead(analysis, callData);
            result.contactId = lead.id;
            result.actions.push('lead_created');
            if (analysis.appointmentRequest?.requested) {
                const appointment = await this.bookAppointment(lead, analysis.appointmentRequest, callData);
                if (appointment) {
                    result.appointmentId = appointment.id;
                    result.actions.push('appointment_booked');
                }
            }
            if (analysis.callbackRequest?.requested) {
                const callbackTask = await this.scheduleCallback(lead, analysis.callbackRequest, callData);
                if (callbackTask) {
                    result.callbackTaskId = callbackTask.id;
                    result.actions.push('callback_scheduled');
                }
            }
            await this.updateCampaignStage(lead, analysis, callData);
            result.actions.push('campaign_updated');
            if (analysis.interestLevel >= 70) {
                await this.assignToSalesRep(lead, analysis, callData);
                result.actions.push('assigned_to_rep');
            }
            await this.sendNotifications(lead, analysis, result);
            result.actions.push('notifications_sent');
            await this.updateCallRecord(callData.id, analysis, result);
            console.log('✅ Lead processing completed:', result);
            return result;
        }
        catch (error) {
            console.error('❌ Error processing lead:', error);
            throw error;
        }
    }
    async createOrUpdateLead(analysis, callData) {
        const { contactInfo, leadType } = analysis;
        const { data: existingLead } = await supabase_client_1.default
            .from('leads')
            .select('*')
            .eq('phone', contactInfo.phone)
            .eq('organization_id', callData.organization_id)
            .single();
        const leadData = {
            organization_id: callData.organization_id,
            campaign_id: callData.campaign_id,
            first_name: contactInfo.firstName || contactInfo.name?.split(' ')[0] || 'Unknown',
            last_name: contactInfo.lastName || contactInfo.name?.split(' ').slice(1).join(' ') || '',
            email: contactInfo.email || null,
            phone: contactInfo.phone,
            company: leadType === 'b2b' ? (contactInfo.company || null) : null,
            title: leadType === 'b2b' ? (contactInfo.title || null) : null,
            address: contactInfo.address || null,
            city: contactInfo.city || null,
            state: contactInfo.state || null,
            zip: contactInfo.zip || null,
            lead_source: 'ai_call',
            lead_type: leadType,
            lead_quality: this.determineLeadQuality(analysis),
            qualification_status: this.determineQualificationStatus(analysis),
            score: analysis.interestLevel,
            tags: [...analysis.keyTopics, ...analysis.painPoints].slice(0, 5),
            notes: this.generateLeadNotes(analysis),
            custom_fields: {
                ai_analysis: {
                    summary: analysis.summary,
                    sentiment: analysis.sentiment,
                    budget: analysis.budget,
                    timeline: analysis.timeline,
                    decisionMaker: analysis.decisionMaker,
                    competitors: analysis.competitors,
                    objections: analysis.objections,
                    nextSteps: analysis.nextSteps,
                    leadType: leadType
                },
                ...(leadType === 'b2b' && analysis.businessContext ? {
                    businessContext: analysis.businessContext
                } : {}),
                ...(leadType === 'b2c' && analysis.consumerContext ? {
                    consumerContext: analysis.consumerContext
                } : {}),
                call_id: callData.id,
                analyzed_at: new Date().toISOString()
            },
            last_contact_date: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        if (existingLead) {
            const { data: updatedLead, error } = await supabase_client_1.default
                .from('leads')
                .update({
                ...leadData,
                notes: existingLead.notes
                    ? `${existingLead.notes}\n\n--- New Call ${new Date().toLocaleDateString()} ---\n${leadData.notes}`
                    : leadData.notes,
                custom_fields: {
                    ...existingLead.custom_fields,
                    ...leadData.custom_fields,
                    call_history: [
                        ...(existingLead.custom_fields?.call_history || []),
                        callData.id
                    ]
                }
            })
                .eq('id', existingLead.id)
                .select()
                .single();
            if (error)
                throw error;
            console.log('✅ Updated existing lead:', updatedLead.id);
            return updatedLead;
        }
        else {
            const { data: newLead, error } = await supabase_client_1.default
                .from('leads')
                .insert(leadData)
                .select()
                .single();
            if (error)
                throw error;
            console.log('✅ Created new lead:', newLead.id);
            return newLead;
        }
    }
    async bookAppointment(lead, appointmentRequest, callData) {
        try {
            const appointmentDate = this.parseAppointmentDateTime(appointmentRequest.date, appointmentRequest.time, appointmentRequest.timezone);
            if (!appointmentDate) {
                console.warn('⚠️ Could not parse appointment date/time');
                return this.createManualAppointmentTask(lead, appointmentRequest, callData);
            }
            const { data: appointment, error } = await supabase_client_1.default
                .from('appointments')
                .insert({
                lead_id: lead.id,
                call_id: callData.id,
                organization_id: callData.organization_id,
                scheduled_at: appointmentDate.toISOString(),
                duration_minutes: appointmentRequest.duration || 30,
                type: appointmentRequest.type || 'consultation',
                status: 'scheduled',
                notes: appointmentRequest.notes || `Appointment requested during call. Interest level: ${lead.score}%`,
                created_by: 'ai_system',
                metadata: {
                    source: 'ai_call_analysis',
                    original_request: appointmentRequest
                }
            })
                .select()
                .single();
            if (error)
                throw error;
            console.log('✅ Appointment booked:', appointment.id);
            return appointment;
        }
        catch (error) {
            console.error('❌ Error booking appointment:', error);
            return null;
        }
    }
    async scheduleCallback(lead, callbackRequest, callData) {
        try {
            const callbackDate = this.parseCallbackDateTime(callbackRequest.preferredDate, callbackRequest.preferredTime);
            const { data: task, error } = await supabase_client_1.default
                .from('tasks')
                .insert({
                organization_id: callData.organization_id,
                lead_id: lead.id,
                type: 'callback',
                title: `Callback: ${lead.first_name} ${lead.last_name}`,
                description: `Callback requested: ${callbackRequest.reason || 'Follow up from recent call'}`,
                due_date: callbackDate?.toISOString() || null,
                priority: callbackRequest.urgency || 'medium',
                status: 'pending',
                metadata: {
                    phone: lead.phone,
                    preferred_time: callbackRequest.preferredTime,
                    original_call_id: callData.id,
                    ai_notes: callbackRequest
                }
            })
                .select()
                .single();
            if (error)
                throw error;
            console.log('✅ Callback task created:', task.id);
            return task;
        }
        catch (error) {
            console.error('❌ Error scheduling callback:', error);
            return null;
        }
    }
    async updateCampaignStage(lead, analysis, callData) {
        if (!callData.campaign_id)
            return;
        let newStage = 'contacted';
        if (analysis.interestLevel >= 80 || analysis.appointmentRequest?.requested) {
            newStage = 'qualified';
        }
        else if (analysis.interestLevel >= 50 || analysis.callbackRequest?.requested) {
            newStage = 'interested';
        }
        else if (analysis.interestLevel < 20) {
            newStage = 'not_interested';
        }
        await supabase_client_1.default
            .from('campaign_leads')
            .upsert({
            campaign_id: callData.campaign_id,
            lead_id: lead.id,
            status: newStage,
            last_contact_date: new Date().toISOString(),
            notes: `AI Analysis: ${analysis.summary}`
        });
        console.log(`✅ Updated campaign stage to: ${newStage}`);
    }
    async assignToSalesRep(lead, analysis, callData) {
        const { data: reps } = await supabase_client_1.default
            .from('team_members')
            .select('user_id, custom_fields')
            .eq('organization_id', callData.organization_id)
            .eq('role', 'sales_rep')
            .eq('status', 'active');
        if (!reps || reps.length === 0) {
            console.log('⚠️ No sales reps available for assignment');
            return;
        }
        const selectedRep = reps[Math.floor(Math.random() * reps.length)];
        await supabase_client_1.default
            .from('leads')
            .update({
            assigned_to: selectedRep.user_id,
            assigned_at: new Date().toISOString()
        })
            .eq('id', lead.id);
        console.log(`✅ Lead assigned to sales rep: ${selectedRep.user_id}`);
    }
    async sendNotifications(lead, analysis, result) {
        const notifications = [];
        notifications.push({
            type: 'new_lead_created',
            title: '🎉 New Lead Generated!',
            message: `${lead.first_name} ${lead.last_name} (${analysis.leadType.toUpperCase()}) has been added to your CRM from AI call analysis. Interest level: ${analysis.interestLevel}%`,
            priority: 'medium'
        });
        if (analysis.interestLevel >= 80) {
            notifications.push({
                type: 'high_interest_lead',
                title: '🔥 Hot Lead Alert!',
                message: `${lead.first_name} ${lead.last_name} shows ${analysis.interestLevel}% interest! ${result.appointmentId ? '📅 Appointment already booked!' : '⚡ Immediate follow-up recommended!'}`,
                priority: 'high'
            });
        }
        if (result.appointmentId) {
            notifications.push({
                type: 'appointment_booked',
                title: '📅 Appointment Auto-Booked!',
                message: `Meeting scheduled with ${lead.first_name} ${lead.last_name} for ${analysis.appointmentRequest?.date || 'requested time'}. Check your calendar!`,
                priority: 'high'
            });
        }
        if (result.callbackTaskId) {
            notifications.push({
                type: 'callback_scheduled',
                title: '📞 Callback Scheduled',
                message: `Follow-up call scheduled with ${lead.first_name} ${lead.last_name}. ${analysis.callbackRequest?.reason || 'Customer requested callback.'}`,
                priority: 'medium'
            });
        }
        if (analysis.leadType === 'b2b' && analysis.budget) {
            notifications.push({
                type: 'budget_qualified_lead',
                title: '💰 Budget Qualified Lead!',
                message: `${lead.company} has a budget of ${analysis.budget}. ${analysis.decisionMaker ? 'Decision maker engaged!' : 'Multiple stakeholders involved.'}`,
                priority: 'high'
            });
        }
        for (const notification of notifications) {
            await this.notificationService.create({
                organization_id: lead.organization_id,
                type: notification.type,
                title: notification.title,
                message: notification.message,
                priority: notification.priority || 'medium',
                data: {
                    lead_id: lead.id,
                    call_id: result.id,
                    lead_type: analysis.leadType,
                    interest_level: analysis.interestLevel,
                    has_appointment: !!result.appointmentId,
                    has_callback: !!result.callbackTaskId
                }
            });
        }
        if (result.appointmentId && lead.email) {
            await this.emailService.sendAppointmentConfirmation(lead, analysis);
        }
    }
    async updateCallRecord(callId, analysis, result) {
        const updateData = {
            ai_analysis: analysis,
            ai_processed_at: new Date().toISOString(),
            lead_created: !!result.contactId,
            appointment_booked: !!result.appointmentId,
            callback_scheduled: !!result.callbackTaskId,
            interest_level: analysis.interestLevel,
            lead_type: analysis.leadType,
            updated_at: new Date().toISOString(),
            ai_summary: `${analysis.leadType.toUpperCase()} Lead: ${analysis.contactInfo.name || 'Unknown'} - ${analysis.interestLevel}% interest. ${result.appointmentId ? '📅 Appointment booked!' :
                result.callbackTaskId ? '📞 Callback scheduled.' :
                    analysis.interestLevel >= 70 ? '🔥 Hot lead!' : ''}`
        };
        await supabase_client_1.default
            .from('calls')
            .update(updateData)
            .eq('id', callId);
        await supabase_client_1.default
            .from('notifications')
            .insert({
            organization_id: callData.organization_id,
            type: 'call_processed',
            title: '🎉 Call Analysis Complete',
            message: updateData.ai_summary,
            priority: analysis.interestLevel >= 80 ? 'high' : 'medium',
            data: {
                call_id: callId,
                lead_id: result.contactId,
                actions: result.actions
            }
        });
    }
    determineLeadQuality(analysis) {
        if (analysis.interestLevel >= 80 && analysis.decisionMaker)
            return 'hot';
        if (analysis.interestLevel >= 60 || analysis.appointmentRequest?.requested)
            return 'warm';
        if (analysis.interestLevel >= 30)
            return 'cool';
        return 'cold';
    }
    determineQualificationStatus(analysis) {
        if (analysis.interestLevel >= 70 && (analysis.budget || analysis.timeline))
            return 'qualified';
        if (analysis.interestLevel >= 50)
            return 'working';
        if (analysis.interestLevel < 20)
            return 'disqualified';
        return 'new';
    }
    generateLeadNotes(analysis) {
        const notes = [
            `AI Call Analysis - Interest Level: ${analysis.interestLevel}%`,
            `Lead Type: ${analysis.leadType.toUpperCase()}`,
            `Sentiment: ${analysis.sentiment}`,
            analysis.summary
        ];
        if (analysis.leadType === 'b2b' && analysis.businessContext) {
            const ctx = analysis.businessContext;
            if (ctx.industry)
                notes.push(`\nIndustry: ${ctx.industry}`);
            if (ctx.employeeCount)
                notes.push(`Company Size: ${ctx.employeeCount}`);
            if (ctx.currentSolution)
                notes.push(`Current Solution: ${ctx.currentSolution}`);
            if (ctx.decisionProcess)
                notes.push(`Decision Process: ${ctx.decisionProcess}`);
        }
        if (analysis.leadType === 'b2c' && analysis.consumerContext) {
            const ctx = analysis.consumerContext;
            if (ctx.propertyType)
                notes.push(`\nProperty Type: ${ctx.propertyType}`);
            if (ctx.ownership)
                notes.push(`Ownership: ${ctx.ownership}`);
            if (ctx.household)
                notes.push(`Household: ${ctx.household}`);
            if (ctx.motivation)
                notes.push(`Motivation: ${ctx.motivation}`);
        }
        if (analysis.painPoints.length > 0) {
            notes.push(`\nPain Points:\n- ${analysis.painPoints.join('\n- ')}`);
        }
        if (analysis.objections.length > 0) {
            notes.push(`\nObjections:\n- ${analysis.objections.join('\n- ')}`);
        }
        if (analysis.nextSteps.length > 0) {
            notes.push(`\nNext Steps:\n- ${analysis.nextSteps.join('\n- ')}`);
        }
        if (analysis.budget)
            notes.push(`\nBudget: ${analysis.budget}`);
        if (analysis.timeline)
            notes.push(`Timeline: ${analysis.timeline}`);
        if (analysis.decisionMaker) {
            notes.push(`Decision Maker: ${analysis.leadType === 'b2b' ? 'Yes (or has authority)' : 'Primary contact'}`);
        }
        if (analysis.competitors.length > 0) {
            notes.push(`\nCompetitors mentioned: ${analysis.competitors.join(', ')}`);
        }
        return notes.join('\n');
    }
    parseAppointmentDateTime(date, time, timezone) {
        if (!date && !time)
            return null;
        try {
            let appointmentDate = new Date();
            if (date) {
                const parsedDate = new Date(date);
                if (!isNaN(parsedDate.getTime())) {
                    appointmentDate = parsedDate;
                }
            }
            if (time) {
                const [hours, minutes] = time.split(':').map(Number);
                if (!isNaN(hours) && !isNaN(minutes)) {
                    appointmentDate.setHours(hours, minutes, 0, 0);
                }
            }
            return appointmentDate;
        }
        catch (error) {
            console.error('Error parsing appointment date/time:', error);
            return null;
        }
    }
    parseCallbackDateTime(date, time) {
        return this.parseAppointmentDateTime(date, time);
    }
    async createManualAppointmentTask(lead, appointmentRequest, callData) {
        const { data: task } = await supabase_client_1.default
            .from('tasks')
            .insert({
            organization_id: callData.organization_id,
            lead_id: lead.id,
            type: 'schedule_appointment',
            title: `Schedule appointment: ${lead.first_name} ${lead.last_name}`,
            description: `Customer requested: ${JSON.stringify(appointmentRequest)}`,
            priority: 'high',
            status: 'pending'
        })
            .select()
            .single();
        return task;
    }
}
exports.AILeadProcessor = AILeadProcessor;
exports.default = AILeadProcessor;
