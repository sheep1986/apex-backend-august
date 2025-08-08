import { Router, Request, Response } from 'express';
import { campaignExecutor } from '../services/campaign-executor';
import crypto from 'crypto';
import supabase from '../services/supabase-client';

const router = Router();

/**
 * VAPI Webhook Handler for Campaign Automation
 * Processes call results and updates campaign automation system
 */

interface VapiWebhookPayload {
  message: {
    type: 'call-ended' | 'call-started' | 'transcript' | 'tool-calls' | 'speech-update' | 'end-of-call-report';
    call: {
      id: string;
      orgId: string;
      createdAt: string;
      updatedAt: string;
      type: 'inboundPhoneCall' | 'outboundPhoneCall' | 'webCall';
      phoneNumberId?: string;
      assistantId?: string;
      customer?: {
        number?: string;
        name?: string;
      };
      status: 'queued' | 'ringing' | 'in-progress' | 'forwarding' | 'ended';
      endedReason?: 'customer-ended-call' | 'assistant-ended-call' | 'phone-call-provider-closed-websocket' | 'pipeline-error-openai-voice-failed' | 'exceeded-max-duration' | 'silence-timeout' | 'assistant-not-found' | 'license-check-failed' | 'pipeline-error-openai-llm-failed' | 'pipeline-error-azure-voice-failed' | 'pipeline-error-cartesia-voice-failed' | 'pipeline-error-deepgram-transcriber-failed' | 'pipeline-error-gladia-transcriber-failed' | 'pipeline-error-eleven-labs-voice-failed' | 'pipeline-error-playht-voice-failed' | 'pipeline-error-lmnt-voice-failed' | 'pipeline-error-azure-transcriber-failed' | 'pipeline-error-assembly-ai-transcriber-failed' | 'pipeline-error-vapi-llm-failed' | 'pipeline-error-vapi-400-bad-request-validation-failed' | 'pipeline-no-available-model' | 'worker-shutdown' | 'unknown-error' | 'vonage-disconnected' | 'vonage-failed-to-connect-call' | 'phone-call-provider-bypass-enabled-but-no-call-received' | 'vapifault-phone-call-worker-setup-socket-error' | 'vapifault-phone-call-worker-worker-setup-socket-timeout' | 'vapifault-phone-call-worker-could-not-find-call' | 'vapifault-transport-never-connected' | 'vapifault-web-call-user-media-failed';
      startedAt?: string;
      endedAt?: string;
      cost?: number;
      costBreakdown?: {
        transport?: number;
        stt?: number;
        llm?: number;
        tts?: number;
        vapi?: number;
        total?: number;
        llmPromptTokens?: number;
        llmCompletionTokens?: number;
        ttsCharacters?: number;
      };
      messages?: Array<{
        role: 'assistant' | 'user' | 'system' | 'tool' | 'function';
        message: string;
        time: number;
        endTime?: number;
        secondsFromStart: number;
      }>;
      recordingUrl?: string;
      stereoRecordingUrl?: string;
      transcript?: string;
      summary?: string;
      analysis?: {
        summary?: string;
        structuredData?: any;
        successEvaluation?: string;
        userSentiment?: 'positive' | 'negative' | 'neutral';
      };
    };
    timestamp: string;
  };
}

/**
 * Verify VAPI webhook signature
 */
function verifyWebhookSignature(req: Request): boolean {
  const signature = req.headers['x-vapi-signature'] as string;
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  
  if (!signature || !secret) {
    console.log('❌ Missing webhook signature or secret');
    return false;
  }

  try {
    const body = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
    
    return isValid;
  } catch (error) {
    console.error('❌ Error verifying webhook signature:', error);
    return false;
  }
}

/**
 * Main webhook endpoint
 * POST /api/vapi-automation-webhook
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    console.log('📨 Received VAPI webhook:', {
      type: req.body?.message?.type,
      callId: req.body?.message?.call?.id,
      status: req.body?.message?.call?.status
    });

    // Verify webhook signature in production
    if (process.env.NODE_ENV === 'production') {
      if (!verifyWebhookSignature(req)) {
        console.log('❌ Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const payload: VapiWebhookPayload = req.body;
    const { message } = payload;
    const { type, call } = message;
    
    // Log webhook payload for debugging
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

    // Process different event types
    if (type === 'call-ended' || type === 'end-of-call-report') {
      // Both events indicate call completion, but end-of-call-report has more complete data
      console.log(`📊 Processing ${type} event for call ${call.id}`);
      await processCallEnded(call);
    } else if (type === 'call-started') {
      await processCallStarted(call);
    } else {
      console.log(`ℹ️ Received ${type} event for call ${call.id} (not processed)`);
    }

    // Always respond with 200 to acknowledge receipt
    res.status(200).json({ 
      received: true, 
      type,
      callId: call.id,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error processing VAPI webhook:', error);
    
    // Still return 200 to prevent VAPI from retrying
    res.status(200).json({ 
      received: true, 
      error: 'Processing failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Process call started event
 */
async function processCallStarted(call: any) {
  try {
    console.log(`📞 Call started: ${call.id} - ${call.customer?.name || 'Unknown'} (${call.customer?.number || 'Unknown'})`);
    
    // Update call queue status to 'calling'
    // This is handled by the campaign executor when it initiates the call
    
  } catch (error) {
    console.error('❌ Error processing call started:', error);
  }
}

/**
 * Process call ended event
 */
async function processCallEnded(call: any) {
  try {
    console.log(`📞 Call ended: ${call.id} - Status: ${call.status} - Reason: ${call.endedReason}`);
    
    // ⭐ CRITICAL FIX: Extract phone from VAPI call object ⭐
    const customerPhone = call.customer?.number;
    const customerName = call.customer?.name;
    
    // Log extraction for debugging
    console.log(`📱 Extracted customer data: Name: ${customerName}, Phone: ${customerPhone}`);
    if (!customerPhone) {
      console.error(`❌ CRITICAL: No phone number in call.customer for ${call.id}`);
      console.log('Call customer object:', JSON.stringify(call.customer, null, 2));
    }
    
    // Determine call outcome
    const outcome = determineCallOutcome(call);
    
    // Check if we have recording URL from webhook
    let recordingUrl = call.recordingUrl || call.stereoRecordingUrl;
    
    // If no recording URL in webhook, try to fetch it
    if (!recordingUrl && call.id) {
      console.log(`🔍 No recording URL in webhook, fetching from VAPI...`);
      
      // Get organization ID from call queue
      const { data: queuedCall } = await supabase
        .from('call_queue')
        .select('campaign_id, campaigns!inner(organization_id)')
        .eq('last_call_id', call.id)
        .single();
      
      if (queuedCall?.campaigns?.organization_id) {
        const { VapiService } = await import('../services/vapi-service');
        const vapiService = await VapiService.forOrganization(queuedCall.campaigns.organization_id);
        
        if (vapiService) {
          recordingUrl = await vapiService.fetchRecordingUrl(call.id);
          if (recordingUrl) {
            console.log(`✅ Successfully fetched recording URL from VAPI`);
          }
        }
      }
    }
    
    // Extract transcript from messages array
    let transcript = '';
    if (call.messages && Array.isArray(call.messages)) {
      // Convert messages array to transcript format
      transcript = call.messages
        .filter((msg: any) => msg.role === 'user' || msg.role === 'assistant')
        .map((msg: any) => {
          const speaker = msg.role === 'user' ? 'User' : 'AI';
          return `${speaker}: ${msg.message}`;
        })
        .join('\n');
      
      console.log(`📝 Extracted transcript with ${call.messages.length} messages`);
    } else if (call.transcript) {
      // Fallback to direct transcript field if available
      transcript = call.transcript;
      console.log(`📝 Using direct transcript field`);
    } else {
      console.log(`⚠️ No transcript found in webhook for call ${call.id}`);
    }
    
    // Log VAPI duration and cost data for debugging
    console.log(`💰 VAPI Cost Data:`, {
      cost: call.cost,
      costBreakdown: call.costBreakdown,
      startedAt: call.startedAt,
      endedAt: call.endedAt,
      calculatedDuration: calculateDuration(call.startedAt, call.endedAt)
    });
    
    // Create call result object with complete VAPI data
    const callResult = {
      type: 'call-ended',
      call: call,
      outcome: outcome,
      transcript: transcript,
      summary: call.summary,
      analysis: call.analysis,
      messages: call.messages, // Include raw messages for detailed processing
      recordingUrl: recordingUrl,
      cost: call.cost || 0,  // ⭐ Ensure we have a default value ⭐
      costBreakdown: call.costBreakdown,
      duration: calculateDuration(call.startedAt, call.endedAt),  // ⭐ Calculate duration from timestamps ⭐
      // ⭐ CRITICAL: Include extracted customer data ⭐
      customerPhone: customerPhone,
      customerName: customerName
    };

    // Process through campaign executor
    await campaignExecutor.processCallResult(call.id, callResult);
    
    console.log(`✅ Processed call result: ${call.id} - ${outcome} - Recording: ${recordingUrl ? 'Yes' : 'No'}`);
    console.log(`   Transcript: ${transcript ? transcript.substring(0, 100) + '...' : 'No transcript'}`);
    console.log(`   Will trigger AI: ${outcome !== 'no_answer' && outcome !== 'failed' && transcript ? 'Yes' : 'No'}`);
    
  } catch (error) {
    console.error('❌ Error processing call ended:', error);
  }
}

/**
 * Determine call outcome from VAPI call data
 */
function determineCallOutcome(call: any): string {
  const { status, endedReason, startedAt, endedAt } = call;
  
  // Calculate call duration
  const duration = calculateDuration(startedAt, endedAt);
  
  // Determine outcome based on end reason and duration
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
      // Fallback based on duration and status
      if (status === 'ended') {
        if (duration > 10) {
          return 'answered';
        } else {
          return 'no_answer';
        }
      }
      
      // If we have a transcript, it means the call connected
      if (call.transcript || (call.messages && call.messages.length > 0)) {
        return 'answered';
      }
      
      return 'unknown';
  }
}

/**
 * Calculate call duration in seconds
 */
function calculateDuration(startedAt?: string, endedAt?: string): number {
  if (!startedAt || !endedAt) {
    return 0;
  }
  
  try {
    const start = new Date(startedAt);
    const end = new Date(endedAt);
    return Math.round((end.getTime() - start.getTime()) / 1000);
  } catch (error) {
    console.error('❌ Error calculating duration:', error);
    return 0;
  }
}

/**
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'vapi-automation-webhook',
    timestamp: new Date().toISOString()
  });
});

/**
 * Get webhook configuration info
 */
router.get('/config', (req: Request, res: Response) => {
  res.json({
    webhookUrl: `${process.env.BASE_URL || 'http://localhost:3001'}/api/vapi-automation-webhook`,
    hasSecret: !!process.env.VAPI_WEBHOOK_SECRET,
    verificationEnabled: process.env.NODE_ENV === 'production'
  });
});

export default router;