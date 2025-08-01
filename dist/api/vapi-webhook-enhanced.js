"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ai_transcript_analyzer_1 = __importDefault(require("../services/ai-transcript-analyzer"));
const ai_lead_processor_1 = require("../services/ai-lead-processor");
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const router = (0, express_1.Router)();
const aiAnalyzer = new ai_transcript_analyzer_1.default();
const aiProcessor = new ai_lead_processor_1.AILeadProcessor();
router.post('/webhook', async (req, res) => {
    try {
        const payload = req.body;
        const { type, call, assistant, phoneNumber, message } = payload;
        console.log('📞 Received VAPI webhook:', {
            type,
            callId: call?.id,
            duration: call?.duration,
            cost: call?.cost,
            hasTranscript: !!call?.transcript
        });
        await processWebhookData(payload);
        if (type === 'call-ended' && call?.transcript && call?.duration > 30) {
            console.log('🤖 Triggering AI analysis for call:', call.id);
            enqueueForAIProcessing(call).catch(error => {
                console.error('❌ Failed to enqueue AI processing:', error);
            });
        }
        res.status(200).json({
            message: 'Webhook processed successfully',
            type,
            callId: call?.id,
            aiProcessingQueued: type === 'call-ended' && call?.transcript
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
async function processWebhookData(payload) {
    const { type, call } = payload;
    if (!call?.id) {
        console.log('⚠️ No call ID in webhook data');
        return;
    }
    try {
        let organizationId = null;
        const { data: existingCall } = await supabase_client_1.default
            .from('calls')
            .select('organization_id, campaign_id')
            .eq('vapi_call_id', call.id)
            .single();
        if (existingCall) {
            organizationId = existingCall.organization_id;
        }
        const updateData = {
            updated_at: new Date().toISOString(),
            raw_webhook_data: call,
            vapi_webhook_received_at: new Date().toISOString()
        };
        switch (type) {
            case 'call-started':
                updateData.status = 'in-progress';
                updateData.started_at = call.startedAt || new Date().toISOString();
                break;
            case 'call-ended':
                updateData.status = 'completed';
                updateData.ended_at = call.endedAt || new Date().toISOString();
                updateData.duration = call.duration || 0;
                updateData.cost = call.cost || 0;
                updateData.end_reason = call.endedReason;
                if (call.transcript) {
                    updateData.transcript = call.transcript;
                }
                if (call.recording?.url) {
                    updateData.recording_url = call.recording.url;
                }
                if (call.messages && call.messages.length > 0) {
                    const lastMessage = call.messages[call.messages.length - 1];
                    if (lastMessage?.content) {
                        try {
                            const structuredData = JSON.parse(lastMessage.content);
                            if (structuredData.summary)
                                updateData.summary = structuredData.summary;
                            if (structuredData.outcome)
                                updateData.outcome = structuredData.outcome;
                            if (structuredData.sentiment)
                                updateData.sentiment = structuredData.sentiment;
                        }
                        catch (e) {
                            updateData.notes = lastMessage.content.substring(0, 1000);
                        }
                    }
                }
                break;
            case 'hang':
                updateData.status = 'hung-up';
                updateData.ended_at = new Date().toISOString();
                break;
            default:
                console.log('Unhandled webhook type:', type);
        }
        const { error } = await supabase_client_1.default
            .from('calls')
            .update(updateData)
            .eq('vapi_call_id', call.id);
        if (error) {
            console.error('❌ Error updating call:', error);
        }
        else {
            console.log('✅ Call updated successfully');
            if (type === 'call-ended' && existingCall?.campaign_id) {
                await updateCampaignMetrics(existingCall.campaign_id);
            }
        }
    }
    catch (error) {
        console.error('❌ Error processing webhook data:', error);
    }
}
async function enqueueForAIProcessing(call) {
    try {
        const { data: callData, error: callError } = await supabase_client_1.default
            .from('calls')
            .select('*')
            .eq('vapi_call_id', call.id)
            .single();
        if (callError || !callData) {
            console.error('❌ Could not find call data:', callError);
            return;
        }
        if (callData.ai_processed_at) {
            console.log('ℹ️ Call already processed by AI');
            return;
        }
        const { data: queueEntry, error: queueError } = await supabase_client_1.default
            .from('ai_processing_queue')
            .insert({
            call_id: callData.id,
            organization_id: callData.organization_id,
            priority: calculatePriority(callData),
            status: 'pending'
        })
            .select()
            .single();
        if (queueError) {
            if (queueError.code === '23505') {
                console.log('ℹ️ Call already in AI processing queue');
                return;
            }
            throw queueError;
        }
        console.log('✅ Call enqueued for AI processing:', queueEntry.id);
        if (queueEntry.priority >= 8) {
            console.log('🚀 High priority call - processing immediately');
            processAIJob(queueEntry.id).catch(error => {
                console.error('❌ Failed to process high priority job:', error);
            });
        }
    }
    catch (error) {
        console.error('❌ Error enqueueing for AI processing:', error);
        throw error;
    }
}
async function processAIJob(queueId) {
    try {
        const { data: job, error: jobError } = await supabase_client_1.default
            .from('ai_processing_queue')
            .select('*, calls(*)')
            .eq('id', queueId)
            .single();
        if (jobError || !job || !job.calls) {
            throw new Error('Job not found');
        }
        const callData = job.calls;
        await supabase_client_1.default
            .from('ai_processing_queue')
            .update({
            status: 'processing',
            processing_started_at: new Date().toISOString()
        })
            .eq('id', queueId);
        let campaignContext = null;
        if (callData.campaign_id) {
            const { data: campaign } = await supabase_client_1.default
                .from('campaigns')
                .select('name, type, settings')
                .eq('id', callData.campaign_id)
                .single();
            campaignContext = campaign;
        }
        console.log('🧠 Analyzing transcript...');
        const analysis = await aiAnalyzer.analyzeTranscript(callData, campaignContext);
        console.log('📊 Processing analysis results...');
        const result = await aiProcessor.processAnalysis(analysis, callData);
        await supabase_client_1.default
            .from('ai_processing_queue')
            .update({
            status: 'completed',
            processing_completed_at: new Date().toISOString(),
            result: { analysis, processingResult: result }
        })
            .eq('id', queueId);
        console.log('✅ AI processing completed successfully');
    }
    catch (error) {
        console.error('❌ Error in AI processing:', error);
        await supabase_client_1.default
            .from('ai_processing_queue')
            .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
        })
            .eq('id', queueId);
    }
}
function calculatePriority(callData) {
    let priority = 5;
    if (callData.duration > 300)
        priority += 2;
    else if (callData.duration > 180)
        priority += 1;
    if (callData.status === 'completed')
        priority += 1;
    if (callData.outcome?.includes('interested'))
        priority += 2;
    if (callData.outcome?.includes('appointment'))
        priority += 3;
    return Math.min(priority, 10);
}
async function updateCampaignMetrics(campaignId) {
    try {
        const { data: calls } = await supabase_client_1.default
            .from('calls')
            .select('duration, cost, status, interest_level')
            .eq('campaign_id', campaignId);
        if (!calls || calls.length === 0)
            return;
        const metrics = {
            total_calls: calls.length,
            successful_calls: calls.filter(c => c.status === 'completed' && c.duration > 30).length,
            total_duration: calls.reduce((sum, c) => sum + (c.duration || 0), 0),
            total_cost: calls.reduce((sum, c) => sum + (c.cost || 0), 0),
            average_interest_level: calls
                .filter(c => c.interest_level !== null)
                .reduce((sum, c, _, arr) => sum + (c.interest_level || 0) / arr.length, 0),
            high_interest_calls: calls.filter(c => (c.interest_level || 0) >= 70).length
        };
        await supabase_client_1.default
            .from('campaigns')
            .update({
            ...metrics,
            updated_at: new Date().toISOString()
        })
            .eq('id', campaignId);
        console.log('✅ Campaign metrics updated');
    }
    catch (error) {
        console.error('❌ Error updating campaign metrics:', error);
    }
}
router.get('/process-queue', async (req, res) => {
    try {
        const { data: jobs } = await supabase_client_1.default
            .from('ai_processing_queue')
            .select('id')
            .eq('status', 'pending')
            .lte('attempts', 3)
            .order('priority', { ascending: false })
            .order('created_at', { ascending: true })
            .limit(5);
        if (!jobs || jobs.length === 0) {
            return res.json({ message: 'No jobs to process' });
        }
        const results = await Promise.allSettled(jobs.map(job => processAIJob(job.id)));
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        res.json({
            message: 'Queue processed',
            processed: jobs.length,
            successful,
            failed
        });
    }
    catch (error) {
        console.error('❌ Error processing queue:', error);
        res.status(500).json({ error: 'Failed to process queue' });
    }
});
router.post('/analyze/:callId', async (req, res) => {
    try {
        const { callId } = req.params;
        const { data: callData, error } = await supabase_client_1.default
            .from('calls')
            .select('*')
            .eq('id', callId)
            .single();
        if (error || !callData) {
            return res.status(404).json({ error: 'Call not found' });
        }
        const analysis = await aiAnalyzer.analyzeTranscript(callData);
        const result = await aiProcessor.processAnalysis(analysis, callData);
        res.json({
            message: 'Analysis completed',
            analysis,
            result
        });
    }
    catch (error) {
        console.error('❌ Error in manual analysis:', error);
        res.status(500).json({
            error: 'Analysis failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/status', (req, res) => {
    res.json({
        status: 'active',
        features: {
            ai_analysis: true,
            auto_lead_creation: true,
            appointment_booking: true,
            callback_scheduling: true
        },
        endpoints: {
            webhook: '/api/vapi/webhook',
            process_queue: '/api/vapi/process-queue',
            manual_analysis: '/api/vapi/analyze/:callId',
            status: '/api/vapi/status'
        }
    });
});
exports.default = router;
