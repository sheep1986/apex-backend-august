import { Request, Response, Router } from 'express';
import { RequestWithRawBody } from '../middleware/raw-body';
import supabaseService from '../services/supabase-client';
import { VAPIIntegrationService } from '../services/vapi-integration-service';
import crypto from 'crypto';

const router = Router();

// Store processed event IDs to prevent duplicates (in production, use Redis)
const processedEvents = new Set<string>();

/**
 * Get organization ID from call data
 * VAPI webhooks may include organizationId or we need to look it up from call record
 */
async function getOrganizationFromCall(call: any): Promise<string | null> {
  try {
    // First check if organizationId is in the webhook payload
    if (call?.organizationId) {
      return call.organizationId;
    }
    
    // Otherwise look up from our database using vapi_call_id
    if (call?.id) {
      const { data: callRecord } = await supabaseService
        .from('calls')
        .select('organization_id')
        .eq('vapi_call_id', call.id)
        .single();
      
      if (callRecord?.organization_id) {
        return callRecord.organization_id;
      }
    }
    
    // If we still don't have it, try to match by phone number
    if (call?.phoneNumber || call?.customer?.number) {
      const phoneNumber = call.phoneNumber || call.customer?.number;
      const { data: phoneRecord } = await supabaseService
        .from('phone_numbers')
        .select('organization_id')
        .eq('phone_number', phoneNumber)
        .single();
      
      if (phoneRecord?.organization_id) {
        return phoneRecord.organization_id;
      }
    }
    
    console.warn('⚠️ Could not determine organization for webhook');
    return null;
  } catch (error) {
    console.error('❌ Error getting organization from call:', error);
    return null;
  }
}

/**
 * Verify VAPI webhook signature using organization's public key
 */
async function verifyVAPISignature(
  rawBody: string, 
  signature: string | undefined,
  call: any
): Promise<boolean> {
  try {
    // If no signature header, reject in production
    if (!signature) {
      if (process.env.NODE_ENV === 'production') {
        console.error('❌ No signature header in production environment');
        return false;
      }
      console.warn('⚠️ No signature header, allowing in development');
      return true;
    }
    
    // Get organization ID from call data
    const organizationId = await getOrganizationFromCall(call);
    if (!organizationId) {
      console.error('❌ Could not determine organization for signature verification');
      return false;
    }
    
    // Get organization's public key
    const { data: org } = await supabaseService
      .from('organizations')
      .select('vapi_public_key, vapi_api_key')
      .eq('id', organizationId)
      .single();
    
    const publicKey = org?.vapi_public_key || org?.vapi_api_key;
    
    if (!publicKey) {
      console.error('❌ No public key configured for organization:', organizationId);
      return false;
    }
    
    // Verify signature using the VAPIIntegrationService static method
    const isValid = VAPIIntegrationService.verifyWebhookSignature(rawBody, signature, publicKey);
    
    if (!isValid) {
      console.error('❌ Invalid webhook signature for organization:', organizationId);
    } else {
      console.log('✅ Webhook signature verified for organization:', organizationId);
    }
    
    return isValid;
    
  } catch (error) {
    console.error('❌ Signature verification error:', error);
    return false;
  }
}

/**
 * Main VAPI webhook handler - processes all VAPI webhook events
 * CRITICAL: Responds 200 immediately and processes async
 * Now includes proper signature verification using organization's public key
 */
router.post('/webhook', async (req: RequestWithRawBody, res: Response) => {
  const startTime = Date.now();
  
  try {
    // 1. Parse payload first to get call data for org lookup
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { type, call, assistant, phoneNumber, message, transcript } = payload;
    
    // 2. Verify signature using organization's public key
    const signature = req.headers['x-vapi-signature'] as string;
    if (req.rawBody) {
      const isValidSignature = await verifyVAPISignature(req.rawBody, signature, call);
      
      if (!isValidSignature) {
        console.error('❌ Invalid webhook signature, rejecting webhook');
        // Return 401 to indicate signature verification failed
        return res.status(401).json({ 
          error: 'Invalid signature',
          message: 'Webhook signature verification failed'
        });
      }
    } else {
      console.warn('⚠️ No raw body available for signature verification');
      // In production, this should be rejected
      if (process.env.NODE_ENV === 'production') {
        return res.status(400).json({ 
          error: 'Bad request',
          message: 'Raw body required for signature verification'
        });
      }
    }
    
    // 3. IMMEDIATELY acknowledge receipt (within 1 second)
    res.status(200).json({ received: true });
    console.log('✅ Webhook acknowledged in', Date.now() - startTime, 'ms');
    
    // 4. Generate event ID for idempotency
    const eventId = payload.id || `${type}-${call?.id}-${Date.now()}`;
    
    // 5. Check if already processed
    if (processedEvents.has(eventId)) {
      console.log('⏭️ Event already processed:', eventId);
      return;
    }
    processedEvents.add(eventId);
    
    // 6. Log webhook details
    console.log('📞 VAPI Webhook Received:', {
      type,
      eventId,
      callId: call?.id,
      hasTranscript: !!transcript || !!call?.transcript || !!message?.transcript,
      hasCost: call?.cost !== undefined,
      hasDuration: call?.duration !== undefined,
      organizationId: await getOrganizationFromCall(call)
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
    // If we haven't sent a response yet, send error
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

/**
 * Process webhook asynchronously after responding 200
 */
async function processWebhookAsync(type: string, payload: any): Promise<void> {
  const { call, message, transcript, analysis } = payload;
  
  console.log(`⚙️ Processing ${type} event asynchronously`);
  
  // Get organization ID for the call
  const organizationId = await getOrganizationFromCall(call);
  
  switch (type) {
    case 'call-started':
      await handleCallStarted(call, organizationId);
      break;
    
    case 'call-ended':
    case 'end-of-call-report':
      await handleCallEnded(call, organizationId);
      // Schedule transcript fetch if not present
      if (!call?.transcript && !transcript) {
        console.log('📝 No transcript in call-ended, scheduling fetch...');
        scheduleTranscriptFetch(call?.id, organizationId, 5000);
      }
      break;
    
    case 'transcript':
    case 'transcript-complete':
    case 'transcription-complete':
      // Handle transcript as separate event
      const transcriptText = transcript || message?.transcript || payload.transcript;
      if (transcriptText && (call?.id || payload.callId)) {
        await handleTranscript(call?.id || payload.callId, transcriptText, organizationId);
      }
      break;
    
    case 'analysis-complete':
      if (analysis && call?.id) {
        await handleAnalysis(call?.id, analysis, organizationId);
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
      break;
  }
}

/**
 * Handle call started event
 */
async function handleCallStarted(call: any, organizationId: string | null): Promise<void> {
  if (!call?.id) return;
  
  console.log('📞 Call started:', call.id, 'for org:', organizationId);
  
  const updateData: any = {
    vapi_call_id: call.id,
    status: 'in-progress',
    started_at: call.startedAt || new Date().toISOString(),
    phone_number: call.phoneNumber || call.customer?.number,
    assistant_id: call.assistantId,
    updated_at: new Date().toISOString()
  };
  
  // Include organization ID if we have it
  if (organizationId) {
    updateData.organization_id = organizationId;
  }
  
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
async function handleCallEnded(call: any, organizationId: string | null): Promise<void> {
  if (!call?.id) return;
  
  console.log('📞 Call ended:', {
    id: call.id,
    duration: call.duration,
    cost: call.cost,
    hasTranscript: !!call.transcript,
    organizationId
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
async function handleTranscript(
  callId: string, 
  transcript: string,
  organizationId: string | null
): Promise<void> {
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
async function handleAnalysis(
  callId: string, 
  analysis: any,
  organizationId: string | null
): Promise<void> {
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
function scheduleTranscriptFetch(
  callId: string, 
  organizationId: string | null,
  delayMs: number, 
  attempts = 0
): void {
  if (!callId || attempts > 5) return;
  
  setTimeout(async () => {
    try {
      console.log(`🔄 Fetching transcript via API for call ${callId} (attempt ${attempts + 1})`);
      
      // Get VAPI service for the organization
      if (!organizationId) {
        console.error('❌ No organization ID for transcript fetch');
        return;
      }
      
      const vapiService = await VAPIIntegrationService.forOrganization(organizationId);
      if (!vapiService) {
        console.error('❌ Could not create VAPI service for organization');
        return;
      }
      
      // Fetch call details using the service
      const callData = await vapiService.getCall(callId);
      
      if (callData?.transcript) {
        console.log('✅ Transcript fetched via API');
        await handleTranscript(callId, callData.transcript, organizationId);
      } else {
        console.log('⏳ Transcript not ready yet, retrying...');
        // Exponential backoff
        scheduleTranscriptFetch(callId, organizationId, delayMs * 2, attempts + 1);
      }
    } catch (error) {
      console.error('❌ Error fetching transcript:', error);
      // Retry with backoff
      if (attempts < 5) {
        scheduleTranscriptFetch(callId, organizationId, delayMs * 2, attempts + 1);
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
      signatureVerification: 'enabled',
      requiresRawBody: true
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