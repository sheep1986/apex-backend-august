import { Router, Request, Response } from 'express';
import { campaignExecutor } from '../services/campaign-executor';
import supabase from '../services/supabase-client';
import { authenticateUser } from '../middleware/auth';

const router = Router();

// Apply authentication to all routes

/**
 * Start a campaign
 * POST /api/campaign-automation/:campaignId/start
 */
router.post('/:campaignId/start', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    // Get campaign details
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (error || !campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status !== 'draft' && campaign.status !== 'paused') {
      return res.status(400).json({ error: 'Campaign cannot be started from current status' });
    }

    // Update campaign status
    await supabase
      .from('campaigns')
      .update({ 
        status: 'active',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId);

    // The campaign executor will pick up the active campaign automatically
    res.json({ 
      success: true, 
      message: 'Campaign started successfully',
      campaignId,
      status: 'active'
    });

  } catch (error) {
    console.error('❌ Error starting campaign:', error);
    res.status(500).json({ error: 'Failed to start campaign' });
  }
});

/**
 * Pause a campaign
 * POST /api/campaign-automation/:campaignId/pause
 */
router.post('/:campaignId/pause', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    await campaignExecutor.pauseCampaign(campaignId);

    res.json({ 
      success: true, 
      message: 'Campaign paused successfully',
      campaignId,
      status: 'paused'
    });

  } catch (error) {
    console.error('❌ Error pausing campaign:', error);
    res.status(500).json({ error: 'Failed to pause campaign' });
  }
});

/**
 * Resume a campaign
 * POST /api/campaign-automation/:campaignId/resume
 */
router.post('/:campaignId/resume', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    await campaignExecutor.resumeCampaign(campaignId);

    res.json({ 
      success: true, 
      message: 'Campaign resumed successfully',
      campaignId,
      status: 'active'
    });

  } catch (error) {
    console.error('❌ Error resuming campaign:', error);
    res.status(500).json({ error: 'Failed to resume campaign' });
  }
});

/**
 * Get campaign status and metrics
 * GET /api/campaign-automation/:campaignId/status
 */
router.get('/:campaignId/status', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    const status = await campaignExecutor.getCampaignStatus(campaignId);

    if (!status.campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json(status);

  } catch (error) {
    console.error('❌ Error getting campaign status:', error);
    res.status(500).json({ error: 'Failed to get campaign status' });
  }
});

/**
 * Get live campaign monitoring data
 * GET /api/campaign-automation/:campaignId/live
 */
router.get('/:campaignId/live', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;

    // Get current queue status
    const { data: queueData, error: queueError } = await supabase
      .from('call_queue')
      .select('*')
      .eq('campaign_id', campaignId);

    if (queueError) {
      return res.status(500).json({ error: 'Failed to get queue data' });
    }

    // Get today's calls
    const today = new Date().toISOString().split('T')[0];
    const { data: todayCalls, error: callsError } = await supabase
      .from('calls')
      .select('*')
      .eq('campaign_id', campaignId)
      .gte('call_started_at', `${today}T00:00:00`)
      .lt('call_started_at', `${today}T23:59:59`);

    if (callsError) {
      return res.status(500).json({ error: 'Failed to get calls data' });
    }

    const queue = queueData || [];
    const calls = todayCalls || [];

    // Calculate metrics
    const activeCalls = queue.filter(q => q.status === 'calling').map(q => ({
      id: q.last_call_id || q.id,
      leadName: q.contact_name,
      phone: q.phone_number,
      duration: 0, // Would need real-time data from VAPI
      status: 'in-progress',
      assistantName: 'AI Assistant', // Would get from campaign settings
      startedAt: q.last_attempt_at
    }));

    const realTimeMetrics = {
      callsInProgress: activeCalls.length,
      completedToday: calls.length,
      successRateToday: calls.length > 0 ? (calls.filter(c => c.outcome === 'answered').length / calls.length) * 100 : 0,
      costToday: calls.reduce((sum, call) => sum + (call.cost || 0), 0),
      avgDurationToday: calls.length > 0 ? calls.reduce((sum, call) => sum + (call.duration_seconds || 0), 0) / calls.length : 0
    };

    const campaignProgress = {
      leadsRemaining: queue.filter(q => q.status === 'pending').length,
      estimatedCompletion: calculateEstimatedCompletion(queue),
      currentCallsPerHour: calculateCallsPerHour(calls)
    };

    res.json({
      activeCalls,
      realTimeMetrics,
      campaignProgress
    });

  } catch (error) {
    console.error('❌ Error getting live monitoring:', error);
    res.status(500).json({ error: 'Failed to get live monitoring data' });
  }
});

/**
 * Upload contacts for a campaign
 * POST /api/campaign-automation/:campaignId/upload-contacts
 */
router.post('/:campaignId/upload-contacts', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { contacts } = req.body;

    if (!contacts || !Array.isArray(contacts)) {
      return res.status(400).json({ error: 'Contacts array is required' });
    }

    // Validate and prepare contacts
    const validContacts = [];
    const errors = [];

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const rowErrors = [];

      if (!contact.phone) rowErrors.push('Phone number is required');
      if (!contact.first_name && !contact.name) rowErrors.push('Name is required');

      if (rowErrors.length > 0) {
        errors.push({ row: i + 1, errors: rowErrors });
      } else {
        validContacts.push({
          campaign_id: campaignId,
          first_name: contact.first_name || '',
          last_name: contact.last_name || '',
          name: contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
          phone: contact.phone,
          email: contact.email || null,
          company: contact.company || null,
          custom_fields: contact.custom_fields || {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
    }

    // Insert valid contacts
    if (validContacts.length > 0) {
      const { error: insertError } = await supabase
        .from('campaign_contacts')
        .insert(validContacts);

      if (insertError) {
        console.error('❌ Error inserting contacts:', insertError);
        return res.status(500).json({ error: 'Failed to insert contacts' });
      }
    }

    res.json({
      success: true,
      imported: validContacts.length,
      errors: errors,
      totalProcessed: contacts.length
    });

  } catch (error) {
    console.error('❌ Error uploading contacts:', error);
    res.status(500).json({ error: 'Failed to upload contacts' });
  }
});

/**
 * Get campaign performance analytics
 * GET /api/campaign-automation/:campaignId/analytics
 */
router.get('/:campaignId/analytics', async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { days = 7 } = req.query;

    // Get calls from the last N days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days as string));

    const { data: calls, error } = await supabase
      .from('calls')
      .select('*')
      .eq('campaign_id', campaignId)
      .gte('call_started_at', startDate.toISOString())
      .order('call_started_at', { ascending: true });

    if (error) {
      return res.status(500).json({ error: 'Failed to get analytics data' });
    }

    const analytics = {
      totalCalls: calls?.length || 0,
      successfulCalls: calls?.filter(c => c.outcome === 'answered').length || 0,
      avgDuration: calls?.length ? calls.reduce((sum, call) => sum + (call.duration_seconds || 0), 0) / calls.length : 0,
      totalCost: calls?.reduce((sum, call) => sum + (call.cost || 0), 0) || 0,
      conversionsByOutcome: calls?.reduce((acc, call) => {
        acc[call.outcome] = (acc[call.outcome] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {},
      callsByHour: generateCallsByHour(calls || []),
      sentimentAnalysis: {
        positive: 0, // Would analyze from AI analysis
        neutral: 0,
        negative: 0
      }
    };

    res.json(analytics);

  } catch (error) {
    console.error('❌ Error getting analytics:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

/**
 * Helper function to calculate estimated completion
 */
function calculateEstimatedCompletion(queue: any[]): string {
  const pending = queue.filter(q => q.status === 'pending').length;
  if (pending === 0) return 'Completed';
  
  // Estimate based on current call rate (simplified)
  const hoursRemaining = Math.ceil(pending / 10); // Assume 10 calls per hour
  const completionDate = new Date();
  completionDate.setHours(completionDate.getHours() + hoursRemaining);
  
  return completionDate.toISOString();
}

/**
 * Helper function to calculate calls per hour
 */
function calculateCallsPerHour(calls: any[]): number {
  if (calls.length === 0) return 0;
  
  const lastHour = new Date();
  lastHour.setHours(lastHour.getHours() - 1);
  
  const callsLastHour = calls.filter(call => 
    new Date(call.call_started_at) > lastHour
  );
  
  return callsLastHour.length;
}

/**
 * Helper function to generate calls by hour data
 */
function generateCallsByHour(calls: any[]): Array<{ hour: number; count: number }> {
  const hourCounts: Record<number, number> = {};
  
  calls.forEach(call => {
    const hour = new Date(call.call_started_at).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });
  
  // Generate array for all 24 hours
  const result = [];
  for (let hour = 0; hour < 24; hour++) {
    result.push({ hour, count: hourCounts[hour] || 0 });
  }
  
  return result;
}

export default router;