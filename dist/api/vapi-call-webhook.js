"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const router = (0, express_1.Router)();
router.post('/', async (req, res) => {
    try {
        console.log('📞 Received VAPI webhook:', JSON.stringify(req.body, null, 2));
        const { message, call, transcript, summary, analysis } = req.body;
        if (message?.type !== 'call.ended' && !call?.endedReason) {
            console.log('🔄 Ignoring non-call-ended webhook');
            return res.status(200).json({ message: 'Event ignored' });
        }
        const callData = {
            vapi_call_id: call?.id,
            phone_number: call?.customer?.number || call?.phoneNumber,
            call_started_at: call?.startedAt ? new Date(call.startedAt).toISOString() : new Date().toISOString(),
            call_ended_at: call?.endedAt ? new Date(call.endedAt).toISOString() : new Date().toISOString(),
            duration_seconds: call?.duration || 0,
            raw_vapi_data: req.body
        };
        let outcome = 'failed';
        let outcome_reason = call?.endedReason || 'Unknown';
        if (call?.endedReason) {
            switch (call.endedReason.toLowerCase()) {
                case 'customer-ended-call':
                case 'customer-hung-up':
                    outcome = 'answered';
                    break;
                case 'voicemail':
                    outcome = 'voicemail';
                    break;
                case 'no-answer':
                case 'customer-did-not-answer':
                    outcome = 'no_answer';
                    break;
                case 'busy':
                case 'customer-busy':
                    outcome = 'busy';
                    break;
                case 'assistant-ended-call':
                    outcome = 'answered';
                    break;
                default:
                    outcome = 'failed';
            }
        }
        let processedTranscript = [];
        if (transcript && Array.isArray(transcript)) {
            processedTranscript = transcript.map((entry) => ({
                speaker: entry.role === 'assistant' ? 'ai' : 'user',
                text: entry.content || entry.message || '',
                timestamp: entry.timestamp || callData.call_started_at
            }));
        }
        let ai_sentiment_score = null;
        let ai_qualification_score = null;
        let ai_summary = null;
        let ai_next_action = null;
        let is_qualified = false;
        if (analysis) {
            ai_sentiment_score = analysis.sentiment?.score || null;
            ai_qualification_score = analysis.qualification?.score || null;
            ai_summary = analysis.summary || summary || null;
            ai_next_action = analysis.nextAction || analysis.recommendation || null;
            is_qualified = (ai_qualification_score && ai_qualification_score > 0.7) || (analysis.qualified === true) || (ai_summary && ai_summary.toLowerCase().includes('interested')) || false;
            if (is_qualified) {
                outcome = 'qualified';
            }
        }
        const call_cost_usd = (callData.duration_seconds / 60) * 0.075;
        let campaign_id = null;
        let organization_id = null;
        if (call?.metadata?.campaignId) {
            campaign_id = call.metadata.campaignId;
        }
        else if (call?.assistantId) {
            const { data: campaigns } = await supabase_client_1.default
                .from('campaigns')
                .select('id, organization_id')
                .eq('vapi_assistant_id', call.assistantId)
                .limit(1);
            if (campaigns && campaigns.length > 0) {
                campaign_id = campaigns[0].id;
                organization_id = campaigns[0].organization_id;
            }
        }
        if (!campaign_id) {
            console.log('⚠️ No campaign found for call, creating generic entry');
            return res.status(200).json({
                message: 'Call processed but no campaign found',
                warning: 'Unable to associate call with a campaign'
            });
        }
        if (!organization_id && campaign_id) {
            const { data: campaign } = await supabase_client_1.default
                .from('campaigns')
                .select('organization_id')
                .eq('id', campaign_id)
                .single();
            organization_id = campaign?.organization_id;
        }
        if (!organization_id) {
            console.error('❌ No organization found for campaign');
            return res.status(400).json({ error: 'Unable to determine organization' });
        }
        const { data: callAttempt, error } = await supabase_client_1.default
            .from('call_attempts')
            .insert({
            campaign_id,
            organization_id,
            phone_number: callData.phone_number,
            contact_name: call?.customer?.name || null,
            vapi_call_id: callData.vapi_call_id,
            vapi_assistant_id: call?.assistantId,
            call_started_at: callData.call_started_at,
            call_ended_at: callData.call_ended_at,
            duration_seconds: callData.duration_seconds,
            outcome,
            outcome_reason,
            transcript: processedTranscript,
            ai_sentiment_score,
            ai_qualification_score,
            ai_summary,
            ai_next_action,
            is_qualified,
            call_cost_usd,
            raw_vapi_data: callData.raw_vapi_data
        })
            .select()
            .single();
        if (error) {
            console.error('❌ Error inserting call attempt:', error);
            return res.status(500).json({
                error: 'Failed to save call attempt',
                details: error.message
            });
        }
        console.log(`✅ Call attempt saved: ${callAttempt.id} for campaign ${campaign_id}`);
        if (is_qualified && callData.phone_number) {
            try {
                const contactData = {
                    phone: callData.phone_number,
                    firstName: call?.customer?.name?.split(' ')[0] || 'Unknown',
                    lastName: call?.customer?.name?.split(' ').slice(1).join(' ') || '',
                    email: call?.customer?.email || '',
                    company: '',
                    status: 'interested',
                    source: 'AI Voice Call',
                    campaign: campaign_id,
                    notes: ai_summary || 'Qualified lead from AI voice call',
                    assignedTo: 'AI System',
                    tags: ['ai-qualified', 'voice-call'],
                    vapiCallId: callData.vapi_call_id,
                    originalCallId: callAttempt.id
                };
                const { data: existingContact } = await supabase_client_1.default
                    .from('contacts')
                    .select('id')
                    .eq('phone', callData.phone_number)
                    .eq('organization_id', organization_id)
                    .single();
                if (existingContact) {
                    await supabase_client_1.default
                        .from('contacts')
                        .update({
                        status: 'interested',
                        notes: contactData.notes,
                        updated_at: new Date().toISOString()
                    })
                        .eq('id', existingContact.id);
                    console.log(`✅ Updated existing contact: ${existingContact.id}`);
                }
                else {
                    const { data: newContact, error: contactError } = await supabase_client_1.default
                        .from('contacts')
                        .insert({
                        ...contactData,
                        organization_id,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                        .select()
                        .single();
                    if (contactError) {
                        console.error('⚠️ Error creating contact:', contactError);
                    }
                    else {
                        console.log(`✅ Created new contact: ${newContact.id}`);
                        await supabase_client_1.default
                            .from('call_attempts')
                            .update({
                            contact_id: newContact.id,
                            created_crm_contact: true
                        })
                            .eq('id', callAttempt.id);
                    }
                }
            }
            catch (contactError) {
                console.error('⚠️ Error processing qualified contact:', contactError);
            }
        }
        res.status(200).json({
            success: true,
            message: 'Call attempt processed successfully',
            callAttemptId: callAttempt.id,
            qualified: is_qualified,
            outcome
        });
    }
    catch (error) {
        console.error('❌ Error processing VAPI webhook:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/test', (req, res) => {
    res.json({
        message: 'VAPI Call Webhook endpoint is active',
        timestamp: new Date().toISOString(),
        endpoint: '/api/vapi-call-webhook'
    });
});
exports.default = router;
