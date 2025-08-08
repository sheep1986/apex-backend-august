"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const crypto_1 = __importDefault(require("crypto"));
const router = (0, express_1.Router)();
const processedEvents = new Set();
function verifyVAPISignature(rawBody, signature) {
    if (!signature || !process.env.VAPI_WEBHOOK_SECRET) {
        console.warn('⚠️ No signature or secret configured for webhook verification');
        return true;
    }
    try {
        const expectedSignature = crypto_1.default
            .createHmac('sha256', process.env.VAPI_WEBHOOK_SECRET)
            .update(rawBody)
            .digest('hex');
        return crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    }
    catch (error) {
        console.error('❌ Signature verification error:', error);
        return false;
    }
}
router.post('/webhook', async (req, res) => {
    const startTime = Date.now();
    try {
        res.status(200).json({ received: true });
        console.log('✅ Webhook acknowledged in', Date.now() - startTime, 'ms');
        const signature = req.headers['x-vapi-signature'];
        if (req.rawBody && !verifyVAPISignature(req.rawBody, signature)) {
            console.error('❌ Invalid webhook signature');
            return;
        }
        const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { type, call, assistant, phoneNumber, message, transcript } = payload;
        const eventId = payload.id || `${type}-${call?.id}-${Date.now()}`;
        if (processedEvents.has(eventId)) {
            console.log('⏭️ Event already processed:', eventId);
            return;
        }
        processedEvents.add(eventId);
        console.log('📞 VAPI Webhook Received:', {
            type,
            eventId,
            callId: call?.id,
            hasTranscript: !!transcript || !!call?.transcript || !!message?.transcript,
            hasCost: call?.cost !== undefined,
            hasDuration: call?.duration !== undefined,
            allKeys: Object.keys(payload),
            messageKeys: message ? Object.keys(message) : [],
            callKeys: call ? Object.keys(call) : []
        });
        await storeRawWebhook(eventId, payload);
        setImmediate(async () => {
            try {
                await processWebhookAsync(type, payload);
            }
            catch (error) {
                console.error('❌ Async webhook processing error:', error);
                await logWebhookError(eventId, error, payload);
            }
        });
    }
    catch (error) {
        console.error('❌ Webhook handler error:', error);
    }
});
async function processWebhookAsync(type, payload) {
    const { call, message, transcript, analysis } = payload;
    console.log(`⚙️ Processing ${type} event asynchronously`);
    switch (type) {
        case 'call-started':
            await handleCallStarted(call);
            break;
        case 'call-ended':
        case 'end-of-call-report':
            await handleCallEnded(call);
            if (!call?.transcript && !transcript) {
                console.log('📝 No transcript in call-ended, scheduling fetch...');
                scheduleTranscriptFetch(call?.id, 5000);
            }
            break;
        case 'transcript':
        case 'transcript-complete':
        case 'transcription-complete':
            const transcriptText = transcript || message?.transcript || payload.transcript;
            if (transcriptText && (call?.id || payload.callId)) {
                await handleTranscript(call?.id || payload.callId, transcriptText);
            }
            break;
        case 'analysis-complete':
            if (analysis && call?.id) {
                await handleAnalysis(call?.id, analysis);
            }
            break;
        case 'speech-update':
        case 'status-update':
            if (message?.transcript && call?.id) {
                await updatePartialTranscript(call?.id, message.transcript);
            }
            break;
        case 'recording-ready':
        case 'recording-available':
            if (payload.recordingUrl && call?.id) {
                await updateRecordingUrl(call?.id, payload.recordingUrl);
            }
            break;
        default:
            console.log(`⚠️ Unhandled webhook type: ${type}`);
            break;
    }
}
async function handleCallStarted(call) {
    if (!call?.id)
        return;
    console.log('📞 Call started:', call.id);
    const updateData = {
        vapi_call_id: call.id,
        status: 'in-progress',
        started_at: call.startedAt || new Date().toISOString(),
        phone_number: call.phoneNumber || call.customer?.number,
        assistant_id: call.assistantId,
        updated_at: new Date().toISOString()
    };
    const { error } = await supabase_client_1.default
        .from('calls')
        .upsert(updateData, {
        onConflict: 'vapi_call_id'
    });
    if (error) {
        console.error('❌ Error updating call start:', error);
    }
}
async function handleCallEnded(call) {
    if (!call?.id)
        return;
    console.log('📞 Call ended:', {
        id: call.id,
        duration: call.duration,
        cost: call.cost,
        hasTranscript: !!call.transcript
    });
    const updateData = {
        status: 'completed',
        ended_at: call.endedAt || new Date().toISOString(),
        end_reason: call.endedReason,
        updated_at: new Date().toISOString(),
        raw_webhook_data: call
    };
    if (call.duration !== undefined)
        updateData.duration = call.duration;
    if (call.cost !== undefined)
        updateData.cost = call.cost;
    if (call.transcript)
        updateData.transcript = call.transcript;
    if (call.summary)
        updateData.summary = call.summary;
    if (call.recordingUrl)
        updateData.recording_url = call.recordingUrl;
    if (call.analysis) {
        updateData.sentiment = call.analysis.sentiment;
        updateData.key_points = call.analysis.keyPoints;
    }
    const { data: updatedCall, error } = await supabase_client_1.default
        .from('calls')
        .update(updateData)
        .or(`vapi_call_id.eq.${call.id},id.eq.${call.id}`)
        .select()
        .single();
    if (error) {
        console.error('❌ Error updating call end:', error);
    }
    else if (updatedCall) {
        console.log('✅ Call record updated');
        if (updateData.transcript) {
            console.log('🤖 Triggering AI processing for transcript');
            triggerAIProcessing(updatedCall.id);
        }
    }
}
async function handleTranscript(callId, transcript) {
    if (!callId || !transcript)
        return;
    console.log('📝 Transcript received for call:', callId, '- Length:', transcript.length);
    const { data: updatedCall, error } = await supabase_client_1.default
        .from('calls')
        .update({
        transcript,
        transcript_received_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    })
        .or(`vapi_call_id.eq.${callId},id.eq.${callId}`)
        .select()
        .single();
    if (error) {
        console.error('❌ Error updating transcript:', error);
    }
    else if (updatedCall) {
        console.log('✅ Transcript saved');
        triggerAIProcessing(updatedCall.id);
    }
}
async function handleAnalysis(callId, analysis) {
    if (!callId || !analysis)
        return;
    console.log('🔍 Analysis received for call:', callId);
    await supabase_client_1.default
        .from('calls')
        .update({
        sentiment: analysis.sentiment,
        key_points: analysis.keyPoints,
        outcome: analysis.outcome,
        call_quality_score: analysis.qualityScore,
        analysis_data: analysis,
        updated_at: new Date().toISOString()
    })
        .or(`vapi_call_id.eq.${callId},id.eq.${callId}`);
}
async function updatePartialTranscript(callId, partialTranscript) {
    if (!callId || !partialTranscript)
        return;
    await supabase_client_1.default
        .from('calls')
        .update({
        partial_transcript: partialTranscript,
        updated_at: new Date().toISOString()
    })
        .or(`vapi_call_id.eq.${callId},id.eq.${callId}`);
}
async function updateRecordingUrl(callId, recordingUrl) {
    if (!callId || !recordingUrl)
        return;
    console.log('🎙️ Recording URL received for call:', callId);
    await supabase_client_1.default
        .from('calls')
        .update({
        recording_url: recordingUrl,
        updated_at: new Date().toISOString()
    })
        .or(`vapi_call_id.eq.${callId},id.eq.${callId}`);
}
function scheduleTranscriptFetch(callId, delayMs, attempts = 0) {
    if (!callId || attempts > 5)
        return;
    setTimeout(async () => {
        try {
            console.log(`🔄 Fetching transcript via API for call ${callId} (attempt ${attempts + 1})`);
            const response = await fetch(`https://api.vapi.ai/call/${callId}`, {
                headers: {
                    'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            if (response.ok) {
                const callData = await response.json();
                if (callData.transcript) {
                    console.log('✅ Transcript fetched via API');
                    await handleTranscript(callId, callData.transcript);
                }
                else {
                    console.log('⏳ Transcript not ready yet, retrying...');
                    scheduleTranscriptFetch(callId, delayMs * 2, attempts + 1);
                }
            }
            else {
                console.error('❌ Failed to fetch call from API:', response.status);
            }
        }
        catch (error) {
            console.error('❌ Error fetching transcript:', error);
            if (attempts < 5) {
                scheduleTranscriptFetch(callId, delayMs * 2, attempts + 1);
            }
        }
    }, delayMs);
}
function triggerAIProcessing(callId) {
    setImmediate(async () => {
        try {
            const { EnhancedAIProcessor } = require('../services/enhanced-ai-processor');
            await EnhancedAIProcessor.processCall(callId);
            console.log('✅ AI processing completed for call', callId);
        }
        catch (error) {
            console.error('❌ AI processing failed:', error);
        }
    });
}
async function storeRawWebhook(eventId, payload) {
    try {
        await supabase_client_1.default
            .from('webhook_logs')
            .insert({
            webhook_type: 'vapi',
            event_id: eventId,
            event_type: payload.type,
            request_body: payload,
            created_at: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Failed to store raw webhook:', error);
    }
}
async function logWebhookError(eventId, error, payload) {
    try {
        await supabase_client_1.default
            .from('webhook_logs')
            .insert({
            webhook_type: 'vapi-error',
            event_id: eventId,
            event_type: payload.type,
            request_body: payload,
            response_body: {
                error: error.message,
                stack: error.stack
            },
            response_status: 500,
            created_at: new Date().toISOString()
        });
    }
    catch (logError) {
        console.error('Failed to log webhook error:', logError);
    }
}
router.get('/status', async (req, res) => {
    const { data: recentWebhooks } = await supabase_client_1.default
        .from('webhook_logs')
        .select('event_type, created_at, response_status')
        .eq('webhook_type', 'vapi')
        .order('created_at', { ascending: false })
        .limit(10);
    res.json({
        status: 'active',
        timestamp: new Date().toISOString(),
        processedEvents: processedEvents.size,
        recentWebhooks: recentWebhooks || [],
        endpoints: {
            webhook: '/api/vapi-enhanced/webhook',
            status: '/api/vapi-enhanced/status'
        },
        configuration: {
            hasWebhookSecret: !!process.env.VAPI_WEBHOOK_SECRET,
            hasVAPIKey: !!process.env.VAPI_API_KEY
        },
        supportedEventTypes: [
            'call-started',
            'call-ended',
            'transcript',
            'transcript-complete',
            'analysis-complete',
            'speech-update',
            'recording-ready'
        ]
    });
});
exports.default = router;
