"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const campaign_executor_1 = require("../services/campaign-executor");
const crypto_1 = __importDefault(require("crypto"));
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const router = (0, express_1.Router)();
function verifyWebhookSignature(req) {
    const signature = req.headers['x-vapi-signature'];
    const secret = process.env.VAPI_WEBHOOK_SECRET;
    if (!signature || !secret) {
        console.log('❌ Missing webhook signature or secret');
        return false;
    }
    try {
        const body = JSON.stringify(req.body);
        const expectedSignature = crypto_1.default
            .createHmac('sha256', secret)
            .update(body)
            .digest('hex');
        const isValid = crypto_1.default.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
        return isValid;
    }
    catch (error) {
        console.error('❌ Error verifying webhook signature:', error);
        return false;
    }
}
router.post('/', async (req, res) => {
    try {
        console.log('📨 Received VAPI webhook:', {
            type: req.body?.message?.type,
            callId: req.body?.message?.call?.id,
            status: req.body?.message?.call?.status
        });
        if (process.env.NODE_ENV === 'production') {
            if (!verifyWebhookSignature(req)) {
                console.log('❌ Invalid webhook signature');
                return res.status(401).json({ error: 'Invalid signature' });
            }
        }
        const payload = req.body;
        const { message } = payload;
        const { type, call } = message;
        console.log('📥 VAPI Webhook Payload:', JSON.stringify({
            type,
            callId: call.id,
            hasRecording: !!call.recordingUrl,
            hasStereoRecording: !!call.stereoRecordingUrl,
            recordingUrl: call.recordingUrl,
            stereoRecordingUrl: call.stereoRecordingUrl,
            hasMessages: !!call.messages,
            messageCount: call.messages?.length || 0,
            hasTranscript: !!call.transcript,
            firstMessage: call.messages?.[0] || null
        }, null, 2));
        if (type === 'call-ended' || type === 'end-of-call-report') {
            console.log(`📊 Processing ${type} event for call ${call.id}`);
            await processCallEnded(call);
        }
        else if (type === 'call-started') {
            await processCallStarted(call);
        }
        else {
            console.log(`ℹ️ Received ${type} event for call ${call.id} (not processed)`);
        }
        res.status(200).json({
            received: true,
            type,
            callId: call.id,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('❌ Error processing VAPI webhook:', error);
        res.status(200).json({
            received: true,
            error: 'Processing failed',
            timestamp: new Date().toISOString()
        });
    }
});
async function processCallStarted(call) {
    try {
        console.log(`📞 Call started: ${call.id} - ${call.customer?.name || 'Unknown'} (${call.customer?.number || 'Unknown'})`);
    }
    catch (error) {
        console.error('❌ Error processing call started:', error);
    }
}
async function processCallEnded(call) {
    try {
        console.log(`📞 Call ended: ${call.id} - Status: ${call.status} - Reason: ${call.endedReason}`);
        const customerPhone = call.customer?.number;
        const customerName = call.customer?.name;
        console.log(`📱 Extracted customer data: Name: ${customerName}, Phone: ${customerPhone}`);
        if (!customerPhone) {
            console.error(`❌ CRITICAL: No phone number in call.customer for ${call.id}`);
            console.log('Call customer object:', JSON.stringify(call.customer, null, 2));
        }
        const outcome = determineCallOutcome(call);
        let recordingUrl = call.recordingUrl || call.stereoRecordingUrl;
        if (!recordingUrl && call.id) {
            console.log(`🔍 No recording URL in webhook, fetching from VAPI...`);
            const { data: queuedCall } = await supabase_client_1.default
                .from('call_queue')
                .select('campaign_id, campaigns!inner(organization_id)')
                .eq('last_call_id', call.id)
                .single();
            if (queuedCall?.campaigns?.organization_id) {
                const { VapiService } = await Promise.resolve().then(() => __importStar(require('../services/vapi-service')));
                const vapiService = await VapiService.forOrganization(queuedCall.campaigns.organization_id);
                if (vapiService) {
                    recordingUrl = await vapiService.fetchRecordingUrl(call.id);
                    if (recordingUrl) {
                        console.log(`✅ Successfully fetched recording URL from VAPI`);
                    }
                }
            }
        }
        let transcript = '';
        if (call.messages && Array.isArray(call.messages)) {
            transcript = call.messages
                .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
                .map((msg) => {
                const speaker = msg.role === 'user' ? 'User' : 'AI';
                return `${speaker}: ${msg.message}`;
            })
                .join('\n');
            console.log(`📝 Extracted transcript with ${call.messages.length} messages`);
        }
        else if (call.transcript) {
            transcript = call.transcript;
            console.log(`📝 Using direct transcript field`);
        }
        else {
            console.log(`⚠️ No transcript found in webhook for call ${call.id}`);
        }
        const callResult = {
            type: 'call-ended',
            call: call,
            outcome: outcome,
            transcript: transcript,
            summary: call.summary,
            analysis: call.analysis,
            messages: call.messages,
            recordingUrl: recordingUrl,
            cost: call.cost,
            costBreakdown: call.costBreakdown,
            duration: calculateDuration(call.startedAt, call.endedAt),
            customerPhone: customerPhone,
            customerName: customerName
        };
        await campaign_executor_1.campaignExecutor.processCallResult(call.id, callResult);
        console.log(`✅ Processed call result: ${call.id} - ${outcome} - Recording: ${recordingUrl ? 'Yes' : 'No'}`);
        console.log(`   Transcript: ${transcript ? transcript.substring(0, 100) + '...' : 'No transcript'}`);
        console.log(`   Will trigger AI: ${outcome !== 'no_answer' && outcome !== 'failed' && transcript ? 'Yes' : 'No'}`);
    }
    catch (error) {
        console.error('❌ Error processing call ended:', error);
    }
}
function determineCallOutcome(call) {
    const { status, endedReason, startedAt, endedAt } = call;
    const duration = calculateDuration(startedAt, endedAt);
    switch (endedReason) {
        case 'customer-ended-call':
            return duration > 30 ? 'answered' : 'quick_hangup';
        case 'assistant-ended-call':
            return 'completed';
        case 'exceeded-max-duration':
            return 'completed';
        case 'silence-timeout':
            return 'no_answer';
        case 'phone-call-provider-closed-websocket':
        case 'vonage-disconnected':
        case 'vonage-failed-to-connect-call':
            return 'provider_error';
        case 'pipeline-error-openai-voice-failed':
        case 'pipeline-error-openai-llm-failed':
        case 'pipeline-error-azure-voice-failed':
        case 'pipeline-error-cartesia-voice-failed':
        case 'pipeline-error-deepgram-transcriber-failed':
        case 'pipeline-error-gladia-transcriber-failed':
        case 'pipeline-error-eleven-labs-voice-failed':
        case 'pipeline-error-playht-voice-failed':
        case 'pipeline-error-lmnt-voice-failed':
        case 'pipeline-error-azure-transcriber-failed':
        case 'pipeline-error-assembly-ai-transcriber-failed':
        case 'pipeline-error-vapi-llm-failed':
        case 'pipeline-error-vapi-400-bad-request-validation-failed':
        case 'pipeline-no-available-model':
        case 'unknown-error':
            return 'system_error';
        case 'assistant-not-found':
        case 'license-check-failed':
            return 'configuration_error';
        default:
            if (status === 'ended') {
                if (duration > 10) {
                    return 'answered';
                }
                else {
                    return 'no_answer';
                }
            }
            return 'unknown';
    }
}
function calculateDuration(startedAt, endedAt) {
    if (!startedAt || !endedAt) {
        return 0;
    }
    try {
        const start = new Date(startedAt);
        const end = new Date(endedAt);
        return Math.round((end.getTime() - start.getTime()) / 1000);
    }
    catch (error) {
        console.error('❌ Error calculating duration:', error);
        return 0;
    }
}
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'vapi-automation-webhook',
        timestamp: new Date().toISOString()
    });
});
router.get('/config', (req, res) => {
    res.json({
        webhookUrl: `${process.env.BASE_URL || 'http://localhost:3001'}/api/vapi-automation-webhook`,
        hasSecret: !!process.env.VAPI_WEBHOOK_SECRET,
        verificationEnabled: process.env.NODE_ENV === 'production'
    });
});
exports.default = router;
