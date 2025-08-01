"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const router = (0, express_1.Router)();
router.post('/webhook', async (req, res) => {
    try {
        const startTime = Date.now();
        const payload = req.body;
        const userAgent = req.get('User-Agent') || '';
        const sourceIp = req.ip || req.connection.remoteAddress || '';
        console.log('📞 STABLE VAPI WEBHOOK received:', {
            type: payload.type,
            callId: payload.call?.id,
            timestamp: new Date().toISOString(),
            userAgent: userAgent.substring(0, 100),
            sourceIp
        });
        const webhookData = extractWebhookData(payload, sourceIp, userAgent);
        const { data: insertedData, error: insertError } = await supabase_client_1.default
            .from('vapi_webhook_data')
            .insert([webhookData])
            .select('id')
            .single();
        if (insertError) {
            console.error('❌ STABLE WEBHOOK: Error storing data:', insertError);
            await logWebhookError(payload, insertError, sourceIp, userAgent);
            return res.status(200).json({
                message: 'Webhook received but storage failed',
                error: insertError.message,
                type: payload.type,
                callId: payload.call?.id,
                processingTime: Date.now() - startTime
            });
        }
        console.log('✅ STABLE WEBHOOK: Data stored successfully:', {
            id: insertedData.id,
            type: payload.type,
            callId: payload.call?.id,
            processingTime: Date.now() - startTime
        });
        res.status(200).json({
            message: 'Webhook processed successfully',
            id: insertedData.id,
            type: payload.type,
            callId: payload.call?.id,
            processingTime: Date.now() - startTime
        });
    }
    catch (error) {
        console.error('❌ STABLE WEBHOOK: Unexpected error:', error);
        try {
            await logWebhookError(req.body, error, req.ip, req.get('User-Agent'));
        }
        catch (logError) {
            console.error('❌ Error logging webhook error:', logError);
        }
        res.status(200).json({
            message: 'Webhook received with errors',
            error: error instanceof Error ? error.message : 'Unknown error',
            type: req.body?.type || 'unknown'
        });
    }
});
function extractWebhookData(payload, sourceIp, userAgent) {
    const call = payload.call || {};
    const assistant = payload.assistant || {};
    const phoneNumber = payload.phoneNumber || {};
    const message = payload.message || {};
    let userEmail = null;
    if (call.metadata?.userEmail) {
        userEmail = call.metadata.userEmail;
    }
    else if (call.customerEmail) {
        userEmail = call.customerEmail;
    }
    else if (assistant.metadata?.userEmail) {
        userEmail = assistant.metadata.userEmail;
    }
    else if (payload.metadata?.userEmail) {
        userEmail = payload.metadata.userEmail;
    }
    else {
        userEmail = 'info@artificialmedia.co.uk';
    }
    const extractedPhoneNumber = call.phoneNumber ||
        call.customer?.phoneNumber ||
        phoneNumber.number ||
        call.to ||
        call.from;
    const callerNumber = call.phoneNumberId ||
        phoneNumber.id ||
        call.caller?.phoneNumber;
    return {
        webhook_type: payload.type || 'unknown',
        webhook_timestamp: new Date().toISOString(),
        webhook_id: payload.id || null,
        vapi_call_id: call.id || `unknown-${Date.now()}`,
        phone_number: extractedPhoneNumber,
        caller_number: callerNumber,
        user_email: userEmail,
        platform_owner_email: 'sean@artificialmedia.co.uk',
        call_status: call.status,
        call_direction: call.type === 'inbound' ? 'inbound' : 'outbound',
        call_duration: call.duration || 0,
        call_cost: call.cost || 0,
        call_started_at: call.startedAt ? new Date(call.startedAt).toISOString() : null,
        call_ended_at: call.endedAt ? new Date(call.endedAt).toISOString() : null,
        end_reason: call.endedReason || call.hangUpReason,
        transcript: call.transcript || message.transcript,
        summary: call.summary || call.analysis?.summary,
        recording_url: call.recordingUrl || call.recording?.url,
        recording_duration: call.recordingDuration || call.recording?.duration || 0,
        assistant_id: assistant.id || call.assistantId,
        assistant_name: assistant.name,
        phone_number_id: phoneNumber.id || call.phoneNumberId,
        call_disposition: call.disposition || call.outcome,
        call_outcome: call.outcome || call.endedReason,
        sentiment: call.sentiment || call.analysis?.sentiment,
        raw_webhook_payload: payload,
        raw_call_data: call,
        raw_assistant_data: assistant,
        raw_phone_data: phoneNumber,
        processing_status: 'processed',
        processing_notes: null,
        source_ip: sourceIp,
        user_agent: userAgent
    };
}
async function logWebhookError(payload, error, sourceIp, userAgent) {
    try {
        const errorData = {
            webhook_type: payload?.type || 'unknown',
            vapi_call_id: payload?.call?.id || `error-${Date.now()}`,
            phone_number: payload?.call?.phoneNumber || null,
            user_email: 'error-log@artificialmedia.co.uk',
            raw_webhook_payload: payload || {},
            processing_status: 'error',
            processing_notes: `Error: ${error?.message || 'Unknown error'}. Stack: ${error?.stack || 'No stack'}`,
            source_ip: sourceIp,
            user_agent: userAgent
        };
        await supabase_client_1.default
            .from('vapi_webhook_data')
            .insert([errorData]);
        console.log('📝 Webhook error logged to database');
    }
    catch (logError) {
        console.error('❌ Failed to log webhook error to database:', logError);
    }
}
router.get('/status', (req, res) => {
    res.json({
        status: 'active',
        system: 'stable-vapi-webhook',
        timestamp: new Date().toISOString(),
        endpoints: {
            webhook: '/api/stable-vapi/webhook',
            status: '/api/stable-vapi/status',
            data: '/api/stable-vapi/data'
        },
        features: [
            'Update-resistant design',
            'Complete data preservation',
            'Email-based user identification',
            'No org dependencies',
            'Full payload capture'
        ],
        supported_events: [
            'call-started',
            'call-ended',
            'hang',
            'speech-update',
            'function-call',
            'transfer-destination-request',
            'tool-calls',
            'end-of-call-report',
            'transcript',
            'conversation-update'
        ]
    });
});
router.get('/data', async (req, res) => {
    try {
        const { user_email, webhook_type, call_status, start_date, end_date, limit = 50, offset = 0 } = req.query;
        let query = supabase_client_1.default
            .from('vapi_webhook_data')
            .select('*')
            .order('webhook_timestamp', { ascending: false });
        if (user_email) {
            query = query.eq('user_email', user_email);
        }
        if (webhook_type) {
            query = query.eq('webhook_type', webhook_type);
        }
        if (call_status) {
            query = query.eq('call_status', call_status);
        }
        if (start_date) {
            query = query.gte('webhook_timestamp', start_date);
        }
        if (end_date) {
            query = query.lte('webhook_timestamp', end_date);
        }
        query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
        const { data, error, count } = await query;
        if (error) {
            console.error('❌ Error fetching VAPI data:', error);
            return res.status(500).json({
                error: 'Failed to fetch data',
                details: error.message
            });
        }
        res.json({
            success: true,
            data: data || [],
            total: count,
            filters: {
                user_email,
                webhook_type,
                call_status,
                start_date,
                end_date
            },
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    }
    catch (error) {
        console.error('❌ Error in data endpoint:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/calls/:callId', async (req, res) => {
    try {
        const { callId } = req.params;
        const { data, error } = await supabase_client_1.default
            .from('vapi_webhook_data')
            .select('*')
            .eq('vapi_call_id', callId)
            .order('webhook_timestamp', { ascending: true });
        if (error) {
            console.error('❌ Error fetching call data:', error);
            return res.status(500).json({
                error: 'Failed to fetch call data',
                details: error.message
            });
        }
        if (!data || data.length === 0) {
            return res.status(404).json({
                error: 'Call not found',
                callId
            });
        }
        const callSummary = buildCallSummary(data);
        res.json({
            success: true,
            callId,
            summary: callSummary,
            events: data,
            totalEvents: data.length
        });
    }
    catch (error) {
        console.error('❌ Error in call endpoint:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
function buildCallSummary(events) {
    const latestEvent = events[events.length - 1];
    const firstEvent = events[0];
    return {
        callId: latestEvent.vapi_call_id,
        userEmail: latestEvent.user_email,
        phoneNumber: latestEvent.phone_number,
        status: latestEvent.call_status,
        duration: latestEvent.call_duration,
        cost: latestEvent.call_cost,
        transcript: latestEvent.transcript,
        summary: latestEvent.summary,
        recordingUrl: latestEvent.recording_url,
        startedAt: firstEvent.call_started_at || firstEvent.webhook_timestamp,
        endedAt: latestEvent.call_ended_at,
        endReason: latestEvent.end_reason,
        sentiment: latestEvent.sentiment,
        eventTypes: [...new Set(events.map(e => e.webhook_type))],
        totalEvents: events.length,
        lastUpdated: latestEvent.webhook_timestamp
    };
}
exports.default = router;
