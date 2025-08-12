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
    try {
        const payload = req.body;
        const { type, call, assistant, phoneNumber, message } = payload;
        console.log('📞 Received VAPI webhook:', {
            type,
            callId: call?.id,
            duration: call?.duration,
            cost: call?.cost
        });
        let organizationId = null;
        if (call?.id) {
            let existingCall;
            const { data: callByVapiId } = await supabase_client_1.default
                .from('calls')
                .select('organization_id, id')
                .eq('vapi_call_id', call.id)
                .single();
            if (callByVapiId) {
                existingCall = callByVapiId;
            }
            else {
                const { data: callById } = await supabase_client_1.default
                    .from('calls')
                    .select('organization_id, id')
                    .eq('id', call.id)
                    .single();
                existingCall = callById;
            }
            if (existingCall) {
                organizationId = existingCall.organization_id;
            }
        }
        if (!organizationId) {
            console.log('⚠️ Could not determine organization for webhook, processing generically');
            if (call?.id && type === 'call-ended') {
                await updateCallFromWebhook(call);
            }
            return res.status(200).json({
                message: 'Webhook processed (no organization context)',
                type,
                callId: call?.id
            });
        }
        const vapiService = await vapi_integration_service_1.VAPIIntegrationService.forOrganization(organizationId);
        if (vapiService) {
            await vapiService.handleWebhook(payload);
            console.log('✅ Webhook processed by VAPIIntegrationService');
        }
        else {
            console.log('⚠️ No VAPI service available, processing webhook manually');
            await handleWebhookManually(payload);
        }
        res.status(200).json({
            message: 'Webhook processed successfully',
            type,
            callId: call?.id,
            organizationId
        });
    }
    catch (error) {
        console.error('❌ Error processing VAPI webhook:', error);
        res.status(500).json({
            error: 'Failed to process webhook',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
async function handleWebhookManually(payload) {
    const { type, call } = payload;
    try {
        switch (type) {
            case 'call-started':
                await updateCallFromWebhook(call, {
                    status: 'in-progress',
                    started_at: call.startedAt || new Date().toISOString()
                });
                break;
            case 'call-ended':
                await updateCallFromWebhook(call, {
                    status: 'completed',
                    ended_at: call.endedAt || new Date().toISOString(),
                    duration: call.duration || 0,
                    cost: call.cost || 0,
                    end_reason: call.endedReason,
                    transcript: call.transcript,
                    summary: call.summary,
                    recording: call.recordingUrl
                });
                break;
            case 'hang':
                await updateCallFromWebhook(call, {
                    status: 'hung-up',
                    ended_at: new Date().toISOString()
                });
                break;
            default:
                console.log('Unhandled webhook type:', type);
        }
    }
    catch (error) {
        console.error('❌ Error in manual webhook handling:', error);
    }
}
async function updateCallFromWebhook(call, updates = {}) {
    if (!call?.id) {
        console.log('⚠️ No call ID in webhook data');
        return;
    }
    try {
        const updateData = {
            updated_at: new Date().toISOString(),
            raw_webhook_data: call,
            vapi_webhook_received_at: new Date().toISOString(),
            ...updates
        };
        if (call.duration !== undefined) {
            updateData.duration = call.duration;
        }
        if (call.cost !== undefined) {
            updateData.cost = call.cost;
        }
        if (call.transcript) {
            updateData.transcript = call.transcript;
        }
        if (call.summary) {
            updateData.summary = call.summary;
        }
        if (call.recordingUrl) {
            updateData.recording_url = call.recordingUrl;
        }
        if (call.recording) {
            updateData.recording_url = call.recording.url || call.recording;
        }
        if (call.analysis) {
            updateData.outcome = call.analysis.outcome || call.analysis.summary;
            updateData.sentiment = call.analysis.sentiment;
            updateData.key_points = call.analysis.keyPoints;
            updateData.call_quality_score = call.analysis.qualityScore || 0;
        }
        if (call.messages && call.messages.length > 0) {
            const lastMessage = call.messages[call.messages.length - 1];
            if (lastMessage?.content) {
                try {
                    const structuredData = JSON.parse(lastMessage.content);
                    if (structuredData.outcome) {
                        updateData.outcome = structuredData.outcome;
                    }
                }
                catch (e) {
                    if (!updateData.outcome) {
                        updateData.outcome = lastMessage.content.substring(0, 500);
                    }
                }
            }
        }
        if (call.startedAt) {
            updateData.started_at = call.startedAt;
        }
        if (call.endedAt) {
            updateData.ended_at = call.endedAt;
        }
        if (call.endedReason) {
            updateData.outcome = updateData.outcome || call.endedReason;
        }
        console.log('📝 Updating call:', {
            callId: call.id,
            updates: Object.keys(updateData),
            cost: updateData.cost
        });
        let callUpdated = null;
        const { data: updatedByVapi, error: vapiError } = await supabase_client_1.default
            .from('calls')
            .update(updateData)
            .eq('vapi_call_id', call.id)
            .select()
            .single();
        if (updatedByVapi) {
            callUpdated = updatedByVapi;
            console.log('✅ Call updated by vapi_call_id');
        }
        else {
            const { data: updatedById, error: idError } = await supabase_client_1.default
                .from('calls')
                .update(updateData)
                .eq('id', call.id)
                .select()
                .single();
            if (updatedById) {
                callUpdated = updatedById;
                console.log('✅ Call updated by regular id');
            }
        }
        if (!callUpdated) {
            console.error('❌ Could not find call to update with ID:', call.id);
        }
        else {
            console.log('✅ Call updated successfully');
            if (updateData.transcript && updateData.status === 'completed' && callUpdated.id) {
                console.log('🤖 Triggering AI processing for transcript...');
                try {
                    const { EnhancedAIProcessor } = require('../services/enhanced-ai-processor');
                    await EnhancedAIProcessor.processCall(callUpdated.id);
                    console.log('✅ AI processing triggered for call', callUpdated.id);
                }
                catch (error) {
                    console.error('❌ Failed to trigger AI processing:', error);
                }
            }
            if (updates.status === 'completed' && call.duration !== undefined) {
                await updateCampaignMetrics(call.id);
            }
        }
    }
    catch (error) {
        console.error('❌ Error updating call from webhook:', error);
    }
}
async function updateCampaignMetrics(vapiCallId) {
    try {
        const { data: call } = await supabase_client_1.default
            .from('calls')
            .select('campaign_id, duration, cost, status')
            .eq('vapi_call_id', vapiCallId)
            .single();
        if (!call?.campaign_id) {
            return;
        }
        const { data: allCalls } = await supabase_client_1.default
            .from('calls')
            .select('duration, cost, status')
            .eq('campaign_id', call.campaign_id);
        const totalCalls = allCalls?.length || 0;
        const successfulCalls = allCalls?.filter(c => c.status === 'completed' && c.duration > 30).length || 0;
        const totalDuration = allCalls?.reduce((sum, c) => sum + (c.duration || 0), 0) || 0;
        const totalCost = allCalls?.reduce((sum, c) => sum + (c.cost || 0), 0) || 0;
        await supabase_client_1.default
            .from('campaigns')
            .update({
            total_calls: totalCalls,
            successful_calls: successfulCalls,
            total_duration: totalDuration,
            total_cost: totalCost,
            updated_at: new Date().toISOString()
        })
            .eq('id', call.campaign_id);
        console.log('✅ Campaign metrics updated:', {
            campaignId: call.campaign_id,
            totalCalls,
            successfulCalls,
            totalDuration,
            totalCost
        });
    }
    catch (error) {
        console.error('❌ Error updating campaign metrics:', error);
    }
}
router.get('/status', (req, res) => {
    res.json({
        status: 'active',
        timestamp: new Date().toISOString(),
        endpoints: {
            webhook: '/api/vapi/webhook',
            status: '/api/vapi/status'
        },
        supported_events: [
            'call-started',
            'call-ended',
            'hang',
            'speech-update',
            'function-call',
            'transfer-destination-request'
        ]
    });
});
exports.default = router;
