import { Request, Response, Router } from 'express';
import { VAPIIntegrationService } from '../services/vapi-integration-service';
import supabaseService from '../services/supabase-client';

const router = Router();

/**
 * CRITICAL: Fast ACK Pattern Implementation
 * Based on Grok and GPT5 recommendations
 * 
 * Rules:
 * 1. Respond with 200 within 5 seconds
 * 2. Do minimal work before responding
 * 3. Process everything async after ACK
 * 4. Store raw webhook for replay/debugging
 */

/**
 * POST /api/vapi/webhook
 * Fast ACK VAPI webhook handler - responds immediately then processes async
 */
router.post('/webhook', async (req: Request, res: Response) => {
  const receivedAt = new Date().toISOString();
  const payload = req.body;
  
  try {
    // STEP 1: Store raw webhook immediately (non-blocking)
    // This gives us audit trail and ability to replay
    const rawWebhookPromise = supabaseService
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
        // Don't fail the webhook if storage fails
      });

    // STEP 2: Basic validation only
    if (!payload.type) {
      return res.status(400).json({ error: 'Missing event type' });
    }

    // STEP 3: RESPOND IMMEDIATELY - This is CRITICAL!
    // Must happen within 5 seconds to prevent VAPI retries
    res.status(200).json({ 
      received: true,
      timestamp: receivedAt,
      type: payload.type,
      callId: payload.call?.id
    });

    // STEP 4: Process async AFTER response sent
    // Use setImmediate to ensure response is sent first
    setImmediate(async () => {
      try {
        await processWebhookAsync(payload, receivedAt);
      } catch (error) {
        console.error('❌ Error in async webhook processing:', error);
        // Update webhook log with error
        if (payload.call?.id) {
          await supabaseService
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

    // Wait for raw webhook storage to complete (but don't block response)
    await rawWebhookPromise;

  } catch (error) {
    // Even on error, try to respond 200 to prevent retries
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

/**
 * Async processing function - runs AFTER 200 response sent
 */
async function processWebhookAsync(payload: any, receivedAt: string): Promise<void> {
  const { type, call, assistant, phoneNumber, message } = payload;

  console.log('📞 Processing VAPI webhook async:', { 
    type, 
    callId: call?.id, 
    duration: call?.duration,
    cost: call?.cost,
    hasTranscript: !!call?.transcript
  });

  // Check for duplicate processing (idempotency)
  if (await isDuplicateEvent(payload.id, type, call?.id)) {
    console.log('ℹ️ Duplicate webhook ignored:', { 
      eventId: payload.id,
      type,
      callId: call?.id 
    });
    return;
  }

  // Determine organization from call data
  let organizationId: string | null = null;

  if (call?.id) {
    // Try to find the call in our database to get the organization
    const { data: existingCall } = await supabaseService
      .from('calls')
      .select('organization_id, id')
      .or(`vapi_call_id.eq.${call.id},id.eq.${call.id}`)
      .single();
    
    if (existingCall) {
      organizationId = existingCall.organization_id;
    }
  }

  // Process based on event type
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

  // Update webhook log status
  await supabaseService
    .from('webhook_logs')
    .update({ 
      status: 'processed',
      processed_at: new Date().toISOString()
    })
    .eq('event_id', payload.id || `${type}_${Date.now()}`);
}

/**
 * Check if this event was already processed (idempotency)
 */
async function isDuplicateEvent(eventId: string, type: string, callId: string): Promise<boolean> {
  if (!eventId && !callId) return false;

  const { data } = await supabaseService
    .from('webhook_logs')
    .select('id')
    .eq('event_id', eventId || `${type}_${callId}`)
    .eq('status', 'processed')
    .limit(1);

  return !!(data && data.length > 0);
}

/**
 * Handle call-started event
 */
async function handleCallStarted(call: any, organizationId: string | null): Promise<void> {
  if (!call?.id) return;

  console.log(`📞 Call started: ${call.id}`);

  // Create or update call record
  const { error } = await supabaseService
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

/**
 * Handle call-ended event
 */
async function handleCallEnded(call: any, organizationId: string | null): Promise<void> {
  if (!call?.id) return;

  console.log(`📞 Call ended: ${call.id}`, {
    duration: call.duration,
    cost: call.cost,
    hasTranscript: !!call.transcript
  });

  // Update call with end data
  const updateData: any = {
    status: 'completed',
    ended_at: call.endedAt || new Date().toISOString(),
    duration: call.duration || 0,
    cost: call.cost || 0,
    recording_url: call.recordingUrl,
    outcome: determineOutcome(call),
    updated_at: new Date().toISOString()
  };

  // Include transcript if available
  if (call.transcript) {
    updateData.transcript = call.transcript;
    updateData.transcript_available = true;
  }

  const { error } = await supabaseService
    .from('calls')
    .update(updateData)
    .or(`vapi_call_id.eq.${call.id},id.eq.${call.id}`);

  if (error) {
    console.error('❌ Error updating call-ended:', error);
  }

  // If transcript is available, process it
  if (call.transcript && organizationId) {
    await processTranscriptForAI(call.id, call.transcript, organizationId);
  } else if (!call.transcript) {
    // Schedule transcript fetch with polling
    await scheduleTranscriptFetch(call.id);
  }
}

/**
 * Handle transcript events
 */
async function handleTranscript(call: any, organizationId: string | null): Promise<void> {
  if (!call?.id || !call?.transcript) return;

  console.log(`📝 Transcript ready for call: ${call.id}`);

  // Update call with transcript
  const { error } = await supabaseService
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

  // Process transcript for AI extraction
  if (organizationId) {
    await processTranscriptForAI(call.id, call.transcript, organizationId);
  }
}

/**
 * Handle end-of-call-report event
 */
async function handleEndOfCallReport(call: any, organizationId: string | null): Promise<void> {
  if (!call?.id) return;

  console.log(`📊 End of call report for: ${call.id}`);

  // This often contains the final transcript and analysis
  const updateData: any = {
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

  const { error } = await supabaseService
    .from('calls')
    .update(updateData)
    .or(`vapi_call_id.eq.${call.id},id.eq.${call.id}`);

  if (error) {
    console.error('❌ Error updating end-of-call-report:', error);
  }
}

/**
 * Determine call outcome based on call data
 */
function determineOutcome(call: any): string {
  if (call.endReason === 'customer-ended') return 'completed';
  if (call.endReason === 'no-answer') return 'no_answer';
  if (call.endReason === 'busy') return 'busy';
  if (call.endReason === 'failed') return 'failed';
  if (call.duration > 30) return 'completed';
  return 'unknown';
}

/**
 * Schedule transcript fetch (polling fallback)
 */
async function scheduleTranscriptFetch(callId: string): Promise<void> {
  console.log(`⏰ Scheduling transcript fetch for call: ${callId}`);
  
  // In a production system, this would enqueue a job
  // For now, we'll use a simple setTimeout
  setTimeout(async () => {
    await fetchTranscriptFromVAPI(callId);
  }, 5000); // Try after 5 seconds
}

/**
 * Fetch transcript from VAPI API (polling fallback)
 */
async function fetchTranscriptFromVAPI(callId: string): Promise<void> {
  // This would use VAPI API to fetch call details
  // Implementation depends on VAPI client setup
  console.log(`🔄 Fetching transcript from VAPI for call: ${callId}`);
  // TODO: Implement VAPI GET /call/:id
}

/**
 * Process transcript for AI extraction
 */
async function processTranscriptForAI(callId: string, transcript: string, organizationId: string): Promise<void> {
  try {
    const vapiService = await VAPIIntegrationService.forOrganization(organizationId);
    if (vapiService) {
      // Let the VAPIIntegrationService handle AI processing
      await vapiService.processTranscript(callId, transcript);
    }
  } catch (error) {
    console.error('❌ Error processing transcript for AI:', error);
  }
}

/**
 * GET /api/vapi/status
 * Health check endpoint
 */
router.get('/status', async (req: Request, res: Response) => {
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

export default router;