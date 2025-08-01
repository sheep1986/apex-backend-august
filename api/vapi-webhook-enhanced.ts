import { Request, Response, Router } from 'express';
import { VAPIIntegrationService } from '../services/vapi-integration-service';
import AITranscriptAnalyzer from '../services/ai-transcript-analyzer';
import { AILeadProcessor } from '../services/ai-lead-processor';
import supabaseService from '../services/supabase-client';

const router = Router();

// Initialize AI services
const aiAnalyzer = new AITranscriptAnalyzer();
const aiProcessor = new AILeadProcessor();

/**
 * Enhanced VAPI webhook handler with AI processing
 */
router.post('/webhook', async (req: Request, res: Response) => {
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

    // First, process the webhook normally
    await processWebhookData(payload);

    // If this is a completed call with transcript, trigger AI analysis
    if (type === 'call-ended' && call?.transcript && call?.duration > 30) {
      console.log('🤖 Triggering AI analysis for call:', call.id);
      
      // Enqueue for AI processing (async, don't wait)
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

  } catch (error) {
    console.error('❌ Error processing VAPI webhook:', error);
    res.status(500).json({ 
      error: 'Failed to process webhook',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Process webhook data and update call records
 */
async function processWebhookData(payload: any): Promise<void> {
  const { type, call } = payload;

  if (!call?.id) {
    console.log('⚠️ No call ID in webhook data');
    return;
  }

  try {
    // Determine organization from call
    let organizationId: string | null = null;
    const { data: existingCall } = await supabaseService
      .from('calls')
      .select('organization_id, campaign_id')
      .eq('vapi_call_id', call.id)
      .single();

    if (existingCall) {
      organizationId = existingCall.organization_id;
    }

    // Update call record based on webhook type
    const updateData: any = {
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
        
        // Extract transcript data
        if (call.transcript) {
          updateData.transcript = call.transcript;
        }
        
        if (call.recording?.url) {
          updateData.recording_url = call.recording.url;
        }
        
        // Extract any structured data from messages
        if (call.messages && call.messages.length > 0) {
          const lastMessage = call.messages[call.messages.length - 1];
          if (lastMessage?.content) {
            try {
              const structuredData = JSON.parse(lastMessage.content);
              if (structuredData.summary) updateData.summary = structuredData.summary;
              if (structuredData.outcome) updateData.outcome = structuredData.outcome;
              if (structuredData.sentiment) updateData.sentiment = structuredData.sentiment;
            } catch (e) {
              // Not JSON, store as text
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

    // Update the call record
    const { error } = await supabaseService
      .from('calls')
      .update(updateData)
      .eq('vapi_call_id', call.id);

    if (error) {
      console.error('❌ Error updating call:', error);
    } else {
      console.log('✅ Call updated successfully');
      
      // Update campaign metrics if call is completed
      if (type === 'call-ended' && existingCall?.campaign_id) {
        await updateCampaignMetrics(existingCall.campaign_id);
      }
    }
  } catch (error) {
    console.error('❌ Error processing webhook data:', error);
  }
}

/**
 * Enqueue call for AI processing
 */
async function enqueueForAIProcessing(call: any): Promise<void> {
  try {
    // Get full call data
    const { data: callData, error: callError } = await supabaseService
      .from('calls')
      .select('*')
      .eq('vapi_call_id', call.id)
      .single();

    if (callError || !callData) {
      console.error('❌ Could not find call data:', callError);
      return;
    }

    // Check if already processed
    if (callData.ai_processed_at) {
      console.log('ℹ️ Call already processed by AI');
      return;
    }

    // Enqueue for processing
    const { data: queueEntry, error: queueError } = await supabaseService
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
      // Check if already in queue
      if (queueError.code === '23505') { // unique violation
        console.log('ℹ️ Call already in AI processing queue');
        return;
      }
      throw queueError;
    }

    console.log('✅ Call enqueued for AI processing:', queueEntry.id);

    // If high priority, process immediately
    if (queueEntry.priority >= 8) {
      console.log('🚀 High priority call - processing immediately');
      processAIJob(queueEntry.id).catch(error => {
        console.error('❌ Failed to process high priority job:', error);
      });
    }
  } catch (error) {
    console.error('❌ Error enqueueing for AI processing:', error);
    throw error;
  }
}

/**
 * Process a single AI job
 */
async function processAIJob(queueId: string): Promise<void> {
  try {
    // Get job from queue
    const { data: job, error: jobError } = await supabaseService
      .from('ai_processing_queue')
      .select('*, calls(*)')
      .eq('id', queueId)
      .single();

    if (jobError || !job || !job.calls) {
      throw new Error('Job not found');
    }

    const callData = job.calls;

    // Update job status
    await supabaseService
      .from('ai_processing_queue')
      .update({
        status: 'processing',
        processing_started_at: new Date().toISOString()
      })
      .eq('id', queueId);

    // Get campaign context if available
    let campaignContext = null;
    if (callData.campaign_id) {
      const { data: campaign } = await supabaseService
        .from('campaigns')
        .select('name, type, settings')
        .eq('id', callData.campaign_id)
        .single();
      
      campaignContext = campaign;
    }

    // Perform AI analysis
    console.log('🧠 Analyzing transcript...');
    const analysis = await aiAnalyzer.analyzeTranscript(callData, campaignContext);

    // Process the analysis (create lead, book appointments, etc.)
    console.log('📊 Processing analysis results...');
    const result = await aiProcessor.processAnalysis(analysis, callData);

    // Update queue with success
    await supabaseService
      .from('ai_processing_queue')
      .update({
        status: 'completed',
        processing_completed_at: new Date().toISOString(),
        result: { analysis, processingResult: result }
      })
      .eq('id', queueId);

    console.log('✅ AI processing completed successfully');

  } catch (error) {
    console.error('❌ Error in AI processing:', error);
    
    // Update queue with failure
    await supabaseService
      .from('ai_processing_queue')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // Retry in 5 minutes
      })
      .eq('id', queueId);
  }
}

/**
 * Calculate processing priority based on call characteristics
 */
function calculatePriority(callData: any): number {
  let priority = 5; // Base priority

  // Longer calls get higher priority
  if (callData.duration > 300) priority += 2; // 5+ minutes
  else if (callData.duration > 180) priority += 1; // 3+ minutes

  // Completed calls get priority
  if (callData.status === 'completed') priority += 1;

  // Calls with certain outcomes get priority
  if (callData.outcome?.includes('interested')) priority += 2;
  if (callData.outcome?.includes('appointment')) priority += 3;

  return Math.min(priority, 10); // Cap at 10
}

/**
 * Update campaign metrics
 */
async function updateCampaignMetrics(campaignId: string): Promise<void> {
  try {
    const { data: calls } = await supabaseService
      .from('calls')
      .select('duration, cost, status, interest_level')
      .eq('campaign_id', campaignId);

    if (!calls || calls.length === 0) return;

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

    await supabaseService
      .from('campaigns')
      .update({
        ...metrics,
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId);

    console.log('✅ Campaign metrics updated');
  } catch (error) {
    console.error('❌ Error updating campaign metrics:', error);
  }
}

/**
 * Background job processor - runs every minute
 */
router.get('/process-queue', async (req: Request, res: Response) => {
  try {
    // Get next job from queue
    const { data: jobs } = await supabaseService
      .from('ai_processing_queue')
      .select('id')
      .eq('status', 'pending')
      .lte('attempts', 3)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(5); // Process up to 5 jobs

    if (!jobs || jobs.length === 0) {
      return res.json({ message: 'No jobs to process' });
    }

    // Process jobs in parallel
    const results = await Promise.allSettled(
      jobs.map(job => processAIJob(job.id))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    res.json({
      message: 'Queue processed',
      processed: jobs.length,
      successful,
      failed
    });

  } catch (error) {
    console.error('❌ Error processing queue:', error);
    res.status(500).json({ error: 'Failed to process queue' });
  }
});

/**
 * Manual AI analysis endpoint for testing
 */
router.post('/analyze/:callId', async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;
    
    // Get call data
    const { data: callData, error } = await supabaseService
      .from('calls')
      .select('*')
      .eq('id', callId)
      .single();

    if (error || !callData) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Perform AI analysis
    const analysis = await aiAnalyzer.analyzeTranscript(callData);
    
    // Process the analysis
    const result = await aiProcessor.processAnalysis(analysis, callData);

    res.json({
      message: 'Analysis completed',
      analysis,
      result
    });

  } catch (error) {
    console.error('❌ Error in manual analysis:', error);
    res.status(500).json({ 
      error: 'Analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get AI processing status
 */
router.get('/status', (req: Request, res: Response) => {
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

export default router;