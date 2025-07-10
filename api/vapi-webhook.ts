import { Request, Response, Router } from 'express';
import { VAPIIntegrationService } from '../services/vapi-integration-service';
import supabaseService from '../services/supabase-client';

const router = Router();

/**
 * POST /api/vapi/webhook
 * Main VAPI webhook handler - processes all VAPI webhook events
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    const { type, call, assistant, phoneNumber, message } = payload;

    console.log('📞 Received VAPI webhook:', { 
      type, 
      callId: call?.id, 
      duration: call?.duration,
      cost: call?.cost 
    });

    // Determine organization from call data
    // We need to find which organization this call belongs to
    let organizationId: string | null = null;

    if (call?.id) {
      // Try to find the call in our database to get the organization
      const { data: existingCall } = await supabaseService
        .from('calls')
        .select('organization_id')
        .eq('vapi_call_id', call.id)
        .single();

      if (existingCall) {
        organizationId = existingCall.organization_id;
      }
    }

    if (!organizationId) {
      console.log('⚠️ Could not determine organization for webhook, processing generically');
      
      // Still try to update call data if we have the call ID
      if (call?.id && type === 'call-ended') {
        await updateCallFromWebhook(call);
      }
      
      return res.status(200).json({ 
        message: 'Webhook processed (no organization context)',
        type,
        callId: call?.id
      });
    }

    // Get VAPI service for the organization
    const vapiService = await VAPIIntegrationService.forOrganization(organizationId);
    
    if (vapiService) {
      // Use the proper VAPIIntegrationService webhook handler
      await vapiService.handleWebhook(payload);
      console.log('✅ Webhook processed by VAPIIntegrationService');
    } else {
      console.log('⚠️ No VAPI service available, processing webhook manually');
      await handleWebhookManually(payload);
    }

    res.status(200).json({ 
      message: 'Webhook processed successfully',
      type,
      callId: call?.id,
      organizationId
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
 * Manually handle webhook when VAPI service is not available
 */
async function handleWebhookManually(payload: any): Promise<void> {
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
  } catch (error) {
    console.error('❌ Error in manual webhook handling:', error);
  }
}

/**
 * Update call record from webhook data
 */
async function updateCallFromWebhook(call: any, updates: any = {}): Promise<void> {
  if (!call?.id) {
    console.log('⚠️ No call ID in webhook data');
    return;
  }

  try {
    const updateData: any = {
      updated_at: new Date().toISOString(),
      ...updates
    };

    // If this is a call completion, ensure we capture all the data
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
      updateData.recording = call.recordingUrl;
    }

    console.log('📝 Updating call:', { 
      callId: call.id, 
      updates: Object.keys(updateData),
      cost: updateData.cost
    });

    const { error } = await supabaseService
      .from('calls')
      .update(updateData)
      .eq('vapi_call_id', call.id);

    if (error) {
      console.error('❌ Error updating call:', error);
    } else {
      console.log('✅ Call updated successfully');
      
      // If call is completed and has campaign, update campaign metrics
      if (updates.status === 'completed' && call.duration !== undefined) {
        await updateCampaignMetrics(call.id);
      }
    }
  } catch (error) {
    console.error('❌ Error updating call from webhook:', error);
  }
}

/**
 * Update campaign metrics when a call completes
 */
async function updateCampaignMetrics(vapiCallId: string): Promise<void> {
  try {
    // Get the call with campaign info
    const { data: call } = await supabaseService
      .from('calls')
      .select('campaign_id, duration, cost, status')
      .eq('vapi_call_id', vapiCallId)
      .single();

    if (!call?.campaign_id) {
      return;
    }

    // Get all calls for this campaign to calculate aggregated metrics
    const { data: allCalls } = await supabaseService
      .from('calls')
      .select('duration, cost, status')
      .eq('campaign_id', call.campaign_id);

    const totalCalls = allCalls?.length || 0;
    const successfulCalls = allCalls?.filter(c => c.status === 'completed' && c.duration > 30).length || 0;
    const totalDuration = allCalls?.reduce((sum, c) => sum + (c.duration || 0), 0) || 0;
    const totalCost = allCalls?.reduce((sum, c) => sum + (c.cost || 0), 0) || 0;

    // Update campaign with aggregated metrics
    await supabaseService
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
  } catch (error) {
    console.error('❌ Error updating campaign metrics:', error);
  }
}

/**
 * GET /api/vapi/status
 * Get webhook status and health check
 */
router.get('/status', (req: Request, res: Response) => {
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

export default router; 