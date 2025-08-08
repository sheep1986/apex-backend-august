import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { EnhancedAIProcessor } from './enhanced-ai-processor';
import supabaseService from './supabase-client';

/**
 * Queue Service for Async Processing
 * Based on GPT5 and Grok's recommendations for reliable async processing
 */

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Queue definitions
export const webhookQueue = new Queue('vapi-webhooks', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed for debugging
    removeOnFail: false, // Keep failed jobs for retry
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const callProcessingQueue = new Queue('call-processing', {
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

export const transcriptFetchQueue = new Queue('transcript-fetch', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: false,
    attempts: 6,
    backoff: {
      type: 'exponential',
      delay: 10000, // Start with 10s, exponentially increase
    },
  },
});

// Idempotency tracking (in production, use Redis SET with TTL)
const processedEvents = new Set<string>();

/**
 * Webhook Worker - Processes incoming VAPI webhooks
 */
const webhookWorker = new Worker('vapi-webhooks', async (job: Job) => {
  const { eventId, type, payload } = job.data;
  
  // Idempotency check
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
        
        // Schedule transcript fetch if missing
        if (!payload.call?.transcript && !payload.transcript) {
          await transcriptFetchQueue.add('fetch-transcript', {
            callId: payload.call?.id,
            attempts: 0,
          }, {
            delay: 5000, // Wait 5s before first attempt
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
  } catch (error) {
    console.error(`❌ Error processing webhook:`, error);
    throw error; // Will trigger retry
  }
}, {
  connection: redis,
  concurrency: 5, // Process up to 5 webhooks simultaneously
});

/**
 * Call Processing Worker - Handles AI extraction and lead creation
 */
const callProcessingWorker = new Worker('call-processing', async (job: Job) => {
  const { callId } = job.data;
  
  console.log(`🤖 Processing call ${callId} with AI`);
  
  try {
    // Get call data
    const { data: call, error } = await supabaseService
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
    
    // Process with Enhanced AI
    const result = await EnhancedAIProcessor.processCall(callId);
    
    return {
      success: true,
      callId,
      leadCreated: result.leadCreated,
      leadId: result.leadId,
    };
  } catch (error) {
    console.error(`❌ Error processing call ${callId}:`, error);
    throw error; // Will trigger retry
  }
}, {
  connection: redis,
  concurrency: 3, // Process up to 3 calls simultaneously
});

/**
 * Transcript Fetch Worker - Fetches missing transcripts from VAPI API
 */
const transcriptFetchWorker = new Worker('transcript-fetch', async (job: Job) => {
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
      // Update call with transcript
      await supabaseService
        .from('calls')
        .update({
          transcript: callData.transcript,
          duration: callData.duration,
          cost: callData.cost,
          updated_at: new Date().toISOString(),
        })
        .or(`vapi_call_id.eq.${callId},id.eq.${callId}`);
      
      // Queue for AI processing
      await callProcessingQueue.add('process-call', { callId });
      
      return { success: true, transcriptFound: true };
    } else {
      // Transcript not ready yet
      if (attempts < 5) {
        // Re-queue with longer delay
        await transcriptFetchQueue.add('fetch-transcript', {
          callId,
          attempts: attempts + 1,
        }, {
          delay: (attempts + 1) * 15000, // Exponential backoff
        });
      }
      
      return { success: false, transcriptFound: false, willRetry: attempts < 5 };
    }
  } catch (error) {
    console.error(`❌ Error fetching transcript:`, error);
    throw error; // Will trigger retry
  }
}, {
  connection: redis,
  concurrency: 2, // Limit API calls
});

// Helper functions
async function handleCallStarted(call: any): Promise<void> {
  if (!call?.id) return;
  
  await supabaseService
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

async function handleCallEnded(call: any): Promise<void> {
  if (!call?.id) return;
  
  const updateData: any = {
    status: 'completed',
    ended_at: call.endedAt || new Date().toISOString(),
    end_reason: call.endedReason,
    updated_at: new Date().toISOString(),
  };
  
  if (call.duration !== undefined) updateData.duration = call.duration;
  if (call.cost !== undefined) updateData.cost = call.cost;
  if (call.transcript) updateData.transcript = call.transcript;
  if (call.recordingUrl) updateData.recording_url = call.recordingUrl;
  
  const { data: updatedCall } = await supabaseService
    .from('calls')
    .update(updateData)
    .or(`vapi_call_id.eq.${call.id},id.eq.${call.id}`)
    .select()
    .single();
  
  // Queue for AI processing if we have a transcript
  if (updateData.transcript && updatedCall) {
    await callProcessingQueue.add('process-call', { 
      callId: updatedCall.id 
    });
  }
}

async function handleTranscript(callId: string, transcript: string): Promise<void> {
  if (!callId || !transcript) return;
  
  const { data: updatedCall } = await supabaseService
    .from('calls')
    .update({
      transcript,
      transcript_received_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .or(`vapi_call_id.eq.${callId},id.eq.${callId}`)
    .select()
    .single();
  
  // Queue for AI processing
  if (updatedCall) {
    await callProcessingQueue.add('process-call', { 
      callId: updatedCall.id 
    });
  }
}

// Event monitoring
const queueEvents = new QueueEvents('vapi-webhooks', { connection: redis });

queueEvents.on('completed', ({ jobId, returnvalue }) => {
  console.log(`✅ Job ${jobId} completed:`, returnvalue);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`❌ Job ${jobId} failed:`, failedReason);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down queue workers...');
  await webhookWorker.close();
  await callProcessingWorker.close();
  await transcriptFetchWorker.close();
  await redis.quit();
});

export default {
  webhookQueue,
  callProcessingQueue,
  transcriptFetchQueue,
  processedEvents,
};