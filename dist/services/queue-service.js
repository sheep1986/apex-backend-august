"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transcriptFetchQueue = exports.callProcessingQueue = exports.webhookQueue = void 0;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const enhanced_ai_processor_1 = require("./enhanced-ai-processor");
const supabase_client_1 = __importDefault(require("./supabase-client"));
const redis = new ioredis_1.default({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});
exports.webhookQueue = new bullmq_1.Queue('vapi-webhooks', {
    connection: redis,
    defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: false,
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
    },
});
exports.callProcessingQueue = new bullmq_1.Queue('call-processing', {
    connection: redis,
    defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: false,
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 5000,
        },
    },
});
exports.transcriptFetchQueue = new bullmq_1.Queue('transcript-fetch', {
    connection: redis,
    defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: false,
        attempts: 6,
        backoff: {
            type: 'exponential',
            delay: 10000,
        },
    },
});
const processedEvents = new Set();
const webhookWorker = new bullmq_1.Worker('vapi-webhooks', async (job) => {
    const { eventId, type, payload } = job.data;
    if (processedEvents.has(eventId)) {
        console.log(`⏭️ Event ${eventId} already processed, skipping`);
        return { skipped: true, reason: 'duplicate' };
    }
    processedEvents.add(eventId);
    console.log(`⚙️ Processing webhook event: ${type}`);
    try {
        switch (type) {
            case 'call-started':
                await handleCallStarted(payload.call);
                break;
            case 'call-ended':
            case 'end-of-call-report':
                await handleCallEnded(payload.call);
                if (!payload.call?.transcript && !payload.transcript) {
                    await exports.transcriptFetchQueue.add('fetch-transcript', {
                        callId: payload.call?.id,
                        attempts: 0,
                    }, {
                        delay: 5000,
                    });
                }
                break;
            case 'transcript':
            case 'transcript-complete':
                const transcript = payload.transcript || payload.message?.transcript;
                if (transcript && payload.call?.id) {
                    await handleTranscript(payload.call.id, transcript);
                }
                break;
            default:
                console.log(`⚠️ Unhandled event type: ${type}`);
        }
        return { success: true, eventId, type };
    }
    catch (error) {
        console.error(`❌ Error processing webhook:`, error);
        throw error;
    }
}, {
    connection: redis,
    concurrency: 5,
});
const callProcessingWorker = new bullmq_1.Worker('call-processing', async (job) => {
    const { callId } = job.data;
    console.log(`🤖 Processing call ${callId} with AI`);
    try {
        const { data: call, error } = await supabase_client_1.default
            .from('calls')
            .select('*')
            .eq('id', callId)
            .single();
        if (error || !call) {
            throw new Error(`Call ${callId} not found`);
        }
        if (!call.transcript) {
            console.log(`⚠️ No transcript for call ${callId}, skipping AI processing`);
            return { skipped: true, reason: 'no-transcript' };
        }
        const result = await enhanced_ai_processor_1.EnhancedAIProcessor.processCall(callId);
        return {
            success: true,
            callId,
            leadCreated: result.leadCreated,
            leadId: result.leadId,
        };
    }
    catch (error) {
        console.error(`❌ Error processing call ${callId}:`, error);
        throw error;
    }
}, {
    connection: redis,
    concurrency: 3,
});
const transcriptFetchWorker = new bullmq_1.Worker('transcript-fetch', async (job) => {
    const { callId, attempts } = job.data;
    console.log(`🔄 Fetching transcript for call ${callId} (attempt ${attempts + 1})`);
    try {
        const response = await fetch(`https://api.vapi.ai/call/${callId}`, {
            headers: {
                'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });
        if (!response.ok) {
            throw new Error(`VAPI API returned ${response.status}`);
        }
        const callData = await response.json();
        if (callData.transcript) {
            await supabase_client_1.default
                .from('calls')
                .update({
                transcript: callData.transcript,
                duration: callData.duration,
                cost: callData.cost,
                updated_at: new Date().toISOString(),
            })
                .or(`vapi_call_id.eq.${callId},id.eq.${callId}`);
            await exports.callProcessingQueue.add('process-call', { callId });
            return { success: true, transcriptFound: true };
        }
        else {
            if (attempts < 5) {
                await exports.transcriptFetchQueue.add('fetch-transcript', {
                    callId,
                    attempts: attempts + 1,
                }, {
                    delay: (attempts + 1) * 15000,
                });
            }
            return { success: false, transcriptFound: false, willRetry: attempts < 5 };
        }
    }
    catch (error) {
        console.error(`❌ Error fetching transcript:`, error);
        throw error;
    }
}, {
    connection: redis,
    concurrency: 2,
});
async function handleCallStarted(call) {
    if (!call?.id)
        return;
    await supabase_client_1.default
        .from('calls')
        .upsert({
        vapi_call_id: call.id,
        status: 'in-progress',
        started_at: call.startedAt || new Date().toISOString(),
        phone_number: call.phoneNumber || call.customer?.number,
        updated_at: new Date().toISOString(),
    }, {
        onConflict: 'vapi_call_id',
    });
}
async function handleCallEnded(call) {
    if (!call?.id)
        return;
    const updateData = {
        status: 'completed',
        ended_at: call.endedAt || new Date().toISOString(),
        end_reason: call.endedReason,
        updated_at: new Date().toISOString(),
    };
    if (call.duration !== undefined)
        updateData.duration = call.duration;
    if (call.cost !== undefined)
        updateData.cost = call.cost;
    if (call.transcript)
        updateData.transcript = call.transcript;
    if (call.recordingUrl)
        updateData.recording_url = call.recordingUrl;
    const { data: updatedCall } = await supabase_client_1.default
        .from('calls')
        .update(updateData)
        .or(`vapi_call_id.eq.${call.id},id.eq.${call.id}`)
        .select()
        .single();
    if (updateData.transcript && updatedCall) {
        await exports.callProcessingQueue.add('process-call', {
            callId: updatedCall.id
        });
    }
}
async function handleTranscript(callId, transcript) {
    if (!callId || !transcript)
        return;
    const { data: updatedCall } = await supabase_client_1.default
        .from('calls')
        .update({
        transcript,
        transcript_received_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    })
        .or(`vapi_call_id.eq.${callId},id.eq.${callId}`)
        .select()
        .single();
    if (updatedCall) {
        await exports.callProcessingQueue.add('process-call', {
            callId: updatedCall.id
        });
    }
}
const queueEvents = new bullmq_1.QueueEvents('vapi-webhooks', { connection: redis });
queueEvents.on('completed', ({ jobId, returnvalue }) => {
    console.log(`✅ Job ${jobId} completed:`, returnvalue);
});
queueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`❌ Job ${jobId} failed:`, failedReason);
});
process.on('SIGTERM', async () => {
    console.log('Shutting down queue workers...');
    await webhookWorker.close();
    await callProcessingWorker.close();
    await transcriptFetchWorker.close();
    await redis.quit();
});
exports.default = {
    webhookQueue: exports.webhookQueue,
    callProcessingQueue: exports.callProcessingQueue,
    transcriptFetchQueue: exports.transcriptFetchQueue,
    processedEvents,
};
