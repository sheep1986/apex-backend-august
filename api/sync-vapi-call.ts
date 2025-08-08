import { Router, Request, Response } from 'express';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { AuthenticatedRequest } from '../middleware/clerk-auth';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const router = Router();

// Apply authentication is handled in server.ts

/**
 * POST /api/sync-vapi-call/:callId
 * Manually sync a call from VAPI API
 */
router.post('/:callId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { callId } = req.params;
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(401).json({ error: 'No organization found' });
    }
    
    console.log(`🔄 Syncing VAPI call ${callId} for org ${organizationId}`);
    
    // Get organization's VAPI credentials
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('settings, vapi_api_key, vapi_private_key')
      .eq('id', organizationId)
      .single();
    
    if (orgError || !organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    // Get VAPI API key
    const vapiApiKey = organization.vapi_private_key || 
                       organization.vapi_api_key || 
                       organization.settings?.vapi?.privateKey ||
                       organization.settings?.vapi?.apiKey;
    
    if (!vapiApiKey) {
      return res.status(400).json({ error: 'VAPI API key not configured' });
    }
    
    // Fetch call from VAPI
    console.log(`📞 Fetching call from VAPI API...`);
    const vapiResponse = await axios.get(`https://api.vapi.ai/call/${callId}`, {
      headers: {
        'Authorization': `Bearer ${vapiApiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    const vapiCall = vapiResponse.data;
    console.log(`✅ Retrieved call from VAPI:`, {
      id: vapiCall.id,
      status: vapiCall.status,
      duration: vapiCall.duration,
      hasTranscript: !!vapiCall.transcript
    });
    
    // Update local call record
    const updateData = {
      status: vapiCall.status === 'ended' ? 'completed' : vapiCall.status,
      duration: vapiCall.duration || 0,
      cost: vapiCall.cost || 0,
      recording_url: vapiCall.recordingUrl || vapiCall.stereoRecordingUrl,
      transcript: vapiCall.transcript,
      summary: vapiCall.summary,
      ended_at: vapiCall.endedAt,
      ended_reason: vapiCall.endedReason,
      metadata: {
        ...vapiCall,
        manually_synced: true,
        synced_at: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    };
    
    const { data: updatedCall, error: updateError } = await supabase
      .from('calls')
      .update(updateData)
      .eq('vapi_call_id', callId)
      .eq('organization_id', organizationId)
      .select()
      .single();
    
    if (updateError) {
      console.error('❌ Error updating call:', updateError);
      return res.status(500).json({ error: 'Failed to update call' });
    }
    
    console.log('✅ Call updated successfully');
    
    // If call ended and has transcript, trigger AI processing
    if (vapiCall.status === 'ended' && vapiCall.transcript) {
      console.log('🤖 Triggering AI processing...');
      
      // Import and use the AI processing logic
      try {
        const { processCallWithAI } = await import('../services/ai-call-processor');
        await processCallWithAI(updatedCall.id, vapiCall);
        console.log('✅ AI processing triggered');
      } catch (aiError) {
        console.error('❌ AI processing failed:', aiError);
        // Don't fail the whole request if AI processing fails
      }
    }
    
    res.json({
      success: true,
      call: updatedCall,
      synced: true,
      aiProcessing: vapiCall.status === 'ended' && vapiCall.transcript
    });
    
  } catch (error: any) {
    console.error('❌ Error syncing VAPI call:', error);
    
    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Call not found in VAPI' });
    }
    
    res.status(500).json({ 
      error: 'Failed to sync call',
      details: error.response?.data || error.message
    });
  }
});

/**
 * GET /api/sync-vapi-call/:callId/status
 * Check if a call needs syncing
 */
router.get('/:callId/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { callId } = req.params;
    const organizationId = req.user?.organizationId;
    
    // Check local call status
    const { data: call, error } = await supabase
      .from('calls')
      .select('status, duration, transcript, updated_at')
      .eq('vapi_call_id', callId)
      .eq('organization_id', organizationId)
      .single();
    
    if (error || !call) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    const needsSync = call.status === 'in_progress' || 
                      call.status === 'ringing' ||
                      (!call.transcript && call.duration > 0);
    
    res.json({
      status: call.status,
      duration: call.duration,
      hasTranscript: !!call.transcript,
      lastUpdated: call.updated_at,
      needsSync
    });
    
  } catch (error) {
    console.error('❌ Error checking call status:', error);
    res.status(500).json({ error: 'Failed to check call status' });
  }
});

export default router;