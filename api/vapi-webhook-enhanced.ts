import { Request, Response, Router } from 'express';
import { RequestWithRawBody } from '../middleware/raw-body';
import supabaseService from '../services/supabase-client';
import crypto from 'crypto';

const router = Router();

// Store processed event IDs to prevent duplicates (in production, use Redis)
const processedEvents = new Set<string>();

/**
 * Verify VAPI webhook signature
 */
function verifyVAPISignature(rawBody: string, signature?: string): boolean {
  if (!signature || !process.env.VAPI_WEBHOOK_SECRET) {
    console.warn('⚠️ No signature or secret configured for webhook verification');
    return true; // Allow in development, but log warning
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', process.env.VAPI_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (error) {
    console.error('❌ Signature verification error:', error);
    return false;
  }
}

/**
 * Main VAPI webhook handler - processes all VAPI webhook events
 * CRITICAL: Responds 200 immediately and processes async
 */
router.post('/webhook', async (req: RequestWithRawBody, res: Response) => {
  const startTime = Date.now();
  
  try {
    // 1. IMMEDIATELY acknowledge receipt (within 1 second)
    res.status(200).json({ received: true });
    console.log('✅ Webhook acknowledged in', Date.now() - startTime, 'ms');
    
    // 2. Verify signature if configured
    const signature = req.headers['x-vapi-signature'] as string;
    if (req.rawBody && !verifyVAPISignature(req.rawBody, signature)) {
      console.error('❌ Invalid webhook signature');
      // Don't process invalid webhooks
      return;
    }
    
    // 3. Parse payload
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { type, call, assistant, phoneNumber, message, transcript } = payload;
    
    // 4. Generate event ID for idempotency
    const eventId = payload.id || `${type}-${call?.id}-${Date.now()}`;
    
    // 5. Check if already processed
    if (processedEvents.has(eventId)) {
      console.log('⏭️ Event already processed:', eventId);
      return;
    }
    processedEvents.add(eventId);
    
    // 6. Log ALL webhook types to understand what VAPI sends
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
    
    // 7. Store raw webhook for debugging
    await storeRawWebhook(eventId, payload);
    
    // 8. Process based on event type (async - after response)
    setImmediate(async () => {
      try {
        await processWebhookAsync(type, payload);
      } catch (error) {
        console.error('❌ Async webhook processing error:', error);
        await logWebhookError(eventId, error, payload);
      }
    });
    
  } catch (error) {
    console.error('❌ Webhook handler error:', error);
    // Response already sent, just log the error
  }
});

/**
 * Process webhook asynchronously after responding 200
 */
async function processWebhookAsync(type: string, payload: any): Promise<void> {
  const { call, message, transcript, analysis } = payload;
  
  console.log(`⚙️ Processing ${type} event asynchronously`);
  
  switch (type) {
    case 'call-started':
      await handleCallStarted(call);
      break;
    
    case 'call-ended':
    case 'end-of-call-report':
      await handleCallEnded(call);
      // Schedule transcript fetch if not present
      if (!call?.transcript && !transcript) {
        console.log('📝 No transcript in call-ended, scheduling fetch...');
        scheduleTranscriptFetch(call?.id, 5000);
      }
      break;
    
    case 'transcript':
    case 'transcript-complete':
    case 'transcription-complete':
      // Handle transcript as separate event
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
      // Real-time updates during call
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
      // Still store it for debugging
      break;
  }
}

/**
 * Handle call started event
 */
async function handleCallStarted(call: any): Promise<void> {
  if (!call?.id) return;
  
  console.log('📞 Call started:', call.id);
  
  const updateData = {
    vapi_call_id: call.id,
    status: 'in-progress',
    started_at: call.startedAt || new Date().toISOString(),
    phone_number: call.phoneNumber || call.customer?.number,
    assistant_id: call.assistantId,
    updated_at: new Date().toISOString()
  };
  
  // Try to update existing call or create new one
  const { error } = await supabaseService
    .from('calls')
    .upsert(updateData, {
      onConflict: 'vapi_call_id'
    });
  
  if (error) {
    console.error('❌ Error updating call start:', error);
  }
}

/**
 * Handle call ended event
 */
async function handleCallEnded(call: any): Promise<void> {
  if (!call?.id) return;
  
  console.log('📞 Call ended:', {
    id: call.id,
    duration: call.duration,
    cost: call.cost,
    hasTranscript: !!call.transcript
  });
  
  const updateData: any = {
    status: 'completed',
    ended_at: call.endedAt || new Date().toISOString(),
    end_reason: call.endedReason,
    updated_at: new Date().toISOString(),
    raw_webhook_data: call
  };
  
  // Include all available data
  if (call.duration !== undefined) updateData.duration = call.duration;
  if (call.cost !== undefined) updateData.cost = call.cost;
  if (call.transcript) updateData.transcript = call.transcript;
  if (call.summary) updateData.summary = call.summary;
  if (call.recordingUrl) updateData.recording_url = call.recordingUrl;
  if (call.analysis) {
    updateData.sentiment = call.analysis.sentiment;
    updateData.key_points = call.analysis.keyPoints;
  }
  
  // Update call record
  const { data: updatedCall, error } = await supabaseService
    .from('calls')
    .update(updateData)
    .or(`vapi_call_id.eq.${call.id},id.eq.${call.id}`)
    .select()
    .single();
  
  if (error) {
    console.error('❌ Error updating call end:', error);
  } else if (updatedCall) {
    console.log('✅ Call record updated');
    
    // Trigger AI processing if we have a transcript
    if (updateData.transcript) {
      console.log('🤖 Triggering AI processing for transcript');
      triggerAIProcessing(updatedCall.id);
    }
  }
}

/**
 * Handle transcript event (separate from call-ended)
 */
async function handleTranscript(callId: string, transcript: string): Promise<void> {
  if (!callId || !transcript) return;
  
  console.log('📝 Transcript received for call:', callId, '- Length:', transcript.length);
  
  const { data: updatedCall, error } = await supabaseService
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
  } else if (updatedCall) {
    console.log('✅ Transcript saved');
    // Trigger AI processing
    triggerAIProcessing(updatedCall.id);
  }
}

/**
 * Handle analysis complete event
 */
async function handleAnalysis(callId: string, analysis: any): Promise<void> {
  if (!callId || !analysis) return;
  
  console.log('🔍 Analysis received for call:', callId);
  
  await supabaseService
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

/**
 * Update partial transcript during call
 */
async function updatePartialTranscript(callId: string, partialTranscript: string): Promise<void> {
  if (!callId || !partialTranscript) return;
  
  // Store partial transcript for real-time updates
  await supabaseService
    .from('calls')
    .update({
      partial_transcript: partialTranscript,
      updated_at: new Date().toISOString()
    })
    .or(`vapi_call_id.eq.${callId},id.eq.${callId}`);
}

/**
 * Update recording URL when available
 */
async function updateRecordingUrl(callId: string, recordingUrl: string): Promise<void> {
  if (!callId || !recordingUrl) return;
  
  console.log('🎙️ Recording URL received for call:', callId);
  
  await supabaseService
    .from('calls')
    .update({
      recording_url: recordingUrl,
      updated_at: new Date().toISOString()
    })
    .or(`vapi_call_id.eq.${callId},id.eq.${callId}`);
}

/**
 * Schedule transcript fetch via API if webhook doesn't deliver it
 */
function scheduleTranscriptFetch(callId: string, delayMs: number, attempts = 0): void {
  if (!callId || attempts > 5) return;
  
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
        } else {
          console.log('⏳ Transcript not ready yet, retrying...');
          // Exponential backoff
          scheduleTranscriptFetch(callId, delayMs * 2, attempts + 1);
        }
      } else {
        console.error('❌ Failed to fetch call from API:', response.status);
      }
    } catch (error) {
      console.error('❌ Error fetching transcript:', error);
      // Retry with backoff
      if (attempts < 5) {
        scheduleTranscriptFetch(callId, delayMs * 2, attempts + 1);
      }
    }
  }, delayMs);
}

/**
 * Trigger AI processing for completed call
 */
function triggerAIProcessing(callId: string): void {
  // In production, this should enqueue to BullMQ
  // For now, process directly but async
  setImmediate(async () => {
    try {
      const { EnhancedAIProcessor } = require('../services/enhanced-ai-processor');
      await EnhancedAIProcessor.processCall(callId);
      console.log('✅ AI processing completed for call', callId);
    } catch (error) {
      console.error('❌ AI processing failed:', error);
    }
  });
}

/**
 * Store raw webhook for debugging and replay
 */
async function storeRawWebhook(eventId: string, payload: any): Promise<void> {
  try {
    await supabaseService
      .from('webhook_logs')
      .insert({
        webhook_type: 'vapi',
        event_id: eventId,
        event_type: payload.type,
        request_body: payload,
        created_at: new Date().toISOString()
      });
  } catch (error) {
    console.error('Failed to store raw webhook:', error);
  }
}

/**
 * Log webhook processing errors
 */
async function logWebhookError(eventId: string, error: any, payload: any): Promise<void> {
  try {
    await supabaseService
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
  } catch (logError) {
    console.error('Failed to log webhook error:', logError);
  }
}

/**
 * GET /api/vapi-enhanced/status
 * Health check and debugging endpoint
 */
router.get('/status', async (req: Request, res: Response) => {
  // Get recent webhook logs
  const { data: recentWebhooks } = await supabaseService
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

export default router;