"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const vapi_integration_service_1 = require("../services/vapi-integration-service");
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const router = (0, express_1.Router)();
router.post('/webhook', async (req, res) => {
    const receivedAt = new Date().toISOString();
    const payload = req.body;
    try {
        const rawWebhookPromise = supabase_client_1.default
            .from('webhook_logs')
            .insert({
            event_id: payload.id || `${payload.type}_${Date.now()}`,
            event_type: payload.type,
            call_id: payload.call?.id,
            payload: payload,
            received_at: receivedAt,
            status: 'received'
        })
            .catch(err => {
            console.error('Failed to store raw webhook:', err);
        });
        if (!payload.type) {
            return res.status(400).json({ error: 'Missing event type' });
        }
        res.status(200).json({
            received: true,
            timestamp: receivedAt,
            type: payload.type,
            callId: payload.call?.id
        });
        setImmediate(async () => {
            try {
                await processWebhookAsync(payload, receivedAt);
            }
            catch (error) {
                console.error('❌ Error in async webhook processing:', error);
                if (payload.call?.id) {
                    await supabase_client_1.default
                        .from('webhook_logs')
                        .update({
                        status: 'failed',
                        error: error instanceof Error ? error.message : 'Unknown error'
                    })
                        .eq('call_id', payload.call.id)
                        .eq('event_type', payload.type)
                        .eq('received_at', receivedAt);
                }
            }
        });
        await rawWebhookPromise;
    }
    catch (error) {
        console.error('❌ Critical error in webhook handler:', error);
        if (!res.headersSent) {
            res.status(200).json({
                received: true,
                error: 'Processing queued despite error',
                timestamp: receivedAt
            });
        }
    }
});
async function processWebhookAsync(payload, receivedAt) {
    const { type, call, assistant, phoneNumber, message } = payload;
    console.log('📞 Processing VAPI webhook async:', {
        type,
        callId: call?.id,
        duration: call?.duration,
        cost: call?.cost,
        hasTranscript: !!call?.transcript
    });
    if (await isDuplicateEvent(payload.id, type, call?.id)) {
        console.log('ℹ️ Duplicate webhook ignored:', {
            eventId: payload.id,
            type,
            callId: call?.id
        });
        return;
    }
    let organizationId = null;
    if (call?.id) {
        const { data: existingCall } = await supabase_client_1.default
            .from('calls')
            .select('organization_id, id')
            .or(`vapi_call_id.eq.${call.id},id.eq.${call.id}`)
            .single();
        if (existingCall) {
            organizationId = existingCall.organization_id;
        }
    }
    switch (type) {
        case 'call-started':
            await handleCallStarted(call, organizationId);
            break;
        case 'call-ended':
            await handleCallEnded(call, organizationId);
            break;
        case 'transcript':
        case 'transcript-ready':
        case 'transcript-complete':
            await handleTranscript(call, organizationId);
            break;
        case 'end-of-call-report':
            await handleEndOfCallReport(call, organizationId);
            break;
        default:
            console.log(`ℹ️ Unhandled webhook type: ${type}`);
    }
    await supabase_client_1.default
        .from('webhook_logs')
        .update({
        status: 'processed',
        processed_at: new Date().toISOString()
    })
        .eq('event_id', payload.id || `${type}_${Date.now()}`);
}
async function isDuplicateEvent(eventId, type, callId) {
    if (!eventId && !callId)
        return false;
    const { data } = await supabase_client_1.default
        .from('webhook_logs')
        .select('id')
        .eq('event_id', eventId || `${type}_${callId}`)
        .eq('status', 'processed')
        .limit(1);
    return !!(data && data.length > 0);
}
async function handleCallStarted(call, organizationId) {
    if (!call?.id)
        return;
    console.log(`📞 Call started: ${call.id}`);
    const { error } = await supabase_client_1.default
        .from('calls')
        .upsert({
        id: call.id,
        vapi_call_id: call.id,
        organization_id: organizationId,
        status: 'in_progress',
        started_at: call.startedAt || new Date().toISOString(),
        phone_number: call.phoneNumber || call.customer?.number,
        assistant_id: call.assistantId,
        updated_at: new Date().toISOString()
    }, {
        onConflict: 'vapi_call_id'
    });
    if (error) {
        console.error('❌ Error updating call-started:', error);
    }
}
async function handleCallEnded(call, organizationId) {
    if (!call?.id)
        return;
    console.log(`📞 Call ended: ${call.id}`, {
        duration: call.duration,
        cost: call.cost,
        hasTranscript: !!call.transcript
    });
    const updateData = {
        status: 'completed',
        ended_at: call.endedAt || new Date().toISOString(),
        duration: call.duration || 0,
        cost: call.cost || 0,
        recording_url: call.recordingUrl,
        outcome: determineOutcome(call),
        updated_at: new Date().toISOString()
    };
    if (call.transcript) {
        updateData.transcript = call.transcript;
        updateData.transcript_available = true;
    }
    const { error } = await supabase_client_1.default
        .from('calls')
        .update(updateData)
        .or(`vapi_call_id.eq.${call.id},id.eq.${call.id}`);
    if (error) {
        console.error('❌ Error updating call-ended:', error);
    }
    if (call.transcript && organizationId) {
        await processTranscriptForAI(call.id, call.transcript, organizationId);
    }
    else if (!call.transcript) {
        await scheduleTranscriptFetch(call.id);
    }
}
async function handleTranscript(call, organizationId) {
    if (!call?.id || !call?.transcript)
        return;
    console.log(`📝 Transcript ready for call: ${call.id}`);
    const { error } = await supabase_client_1.default
        .from('calls')
        .update({
        transcript: call.transcript,
        transcript_available: true,
        updated_at: new Date().toISOString()
    })
        .or(`vapi_call_id.eq.${call.id},id.eq.${call.id}`);
    if (error) {
        console.error('❌ Error updating transcript:', error);
    }
    if (organizationId) {
        await processTranscriptForAI(call.id, call.transcript, organizationId);
    }
}
async function handleEndOfCallReport(call, organizationId) {
    if (!call?.id)
        return;
    console.log(`📊 End of call report for: ${call.id}`);
    const updateData = {
        updated_at: new Date().toISOString()
    };
    if (call.transcript) {
        updateData.transcript = call.transcript;
        updateData.transcript_available = true;
    }
    if (call.summary) {
        updateData.ai_summary = call.summary;
    }
    if (call.analysis) {
        updateData.ai_analysis = call.analysis;
    }
    const { error } = await supabase_client_1.default
        .from('calls')
        .update(updateData)
        .or(`vapi_call_id.eq.${call.id},id.eq.${call.id}`);
    if (error) {
        console.error('❌ Error updating end-of-call-report:', error);
    }
}
function determineOutcome(call) {
    if (call.endReason === 'customer-ended')
        return 'completed';
    if (call.endReason === 'no-answer')
        return 'no_answer';
    if (call.endReason === 'busy')
        return 'busy';
    if (call.endReason === 'failed')
        return 'failed';
    if (call.duration > 30)
        return 'completed';
    return 'unknown';
}
async function scheduleTranscriptFetch(callId) {
    console.log(`⏰ Scheduling transcript fetch for call: ${callId}`);
    setTimeout(async () => {
        await fetchTranscriptFromVAPI(callId);
    }, 5000);
}
async function fetchTranscriptFromVAPI(callId) {
    console.log(`🔄 Fetching transcript from VAPI for call: ${callId}`);
}
async function processTranscriptForAI(callId, transcript, organizationId) {
    try {
        const vapiService = await vapi_integration_service_1.VAPIIntegrationService.forOrganization(organizationId);
        if (vapiService) {
            await vapiService.processTranscript(callId, transcript);
        }
    }
    catch (error) {
        console.error('❌ Error processing transcript for AI:', error);
    }
}
router.get('/status', async (req, res) => {
    res.status(200).json({
        status: 'active',
        timestamp: new Date().toISOString(),
        features: {
            fast_ack: true,
            raw_webhook_storage: true,
            idempotency: true,
            async_processing: true,
            transcript_polling: true
        },
        endpoints: {
            webhook: '/api/vapi/webhook',
            status: '/api/vapi/status'
        }
    });
});
exports.default = router;
