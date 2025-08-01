import { Router, Response } from 'express';
import { AuthenticatedRequest, authenticateUser } from '../middleware/simple-auth';
import supabase from '../services/supabase-client';

const router = Router();

// Apply authentication to all routes
router.use(authenticateUser);

// Helper function to create CRM contact
async function createCRMContactFromCall(call: any) {
  const nameParts = call.customer_name?.split(' ') || ['Unknown'];
  const first_name = nameParts[0] || 'Unknown';
  const last_name = nameParts.slice(1).join(' ') || '';

  // Check if contact already exists
  const { data: existingContact } = await supabase
    .from('leads')
    .select('id')
    .eq('phone', call.phone_number)
    .eq('organization_id', call.organization_id)
    .single();

  if (existingContact) {
    // Update existing contact
    await supabase
      .from('leads')
      .update({
        qualification_status: 'qualified',
        call_status: call.outcome || 'completed',
        last_call_at: call.started_at,
        score: Math.round((call.ai_confidence_score || 0) * 100),
        custom_fields: {
          ...existingContact.custom_fields || {},
          ai_confidence_score: call.ai_confidence_score,
          sentiment: call.sentiment,
          summary: call.summary,
          last_review_date: new Date().toISOString()
        }
      })
      .eq('id', existingContact.id);
    
    return existingContact.id;
  } else {
    // Create new contact
    const { data: newContact } = await supabase
      .from('leads')
      .insert({
        organization_id: call.organization_id,
        campaign_id: call.campaign_id,
        first_name,
        last_name,
        phone: call.phone_number,
        qualification_status: 'qualified',
        lead_source: 'ai_call',
        lead_quality: 'high',
        call_status: call.outcome || 'completed',
        score: Math.round((call.ai_confidence_score || 0) * 100),
        custom_fields: {
          ai_confidence_score: call.ai_confidence_score,
          sentiment: call.sentiment,
          summary: call.summary,
          created_from_review: true
        }
      })
      .select('id')
      .single();
    
    return newContact?.id;
  }
}

// GET /api/lead-review/pending - Get all pending leads for review
router.get('/pending', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const userOrgId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Build query with filters
    let query = supabase
      .from('calls')
      .select(`
        id,
        phone_number,
        customer_name,
        campaign_id,
        vapi_call_id,
        started_at,
        duration,
        outcome,
        sentiment,
        summary,
        ai_confidence_score,
        ai_recommendation,
        key_points,
        buying_signals,
        next_steps,
        campaigns!inner(name)
      `)
      .eq('qualification_status', 'pending')
      .order('ai_confidence_score', { ascending: false });

    // Apply role-based filtering
    if (userRole !== 'platform_owner') {
      query = query.eq('organization_id', userOrgId);
    }

    // Optional filters from query params
    if (req.query.campaign_id) {
      query = query.eq('campaign_id', req.query.campaign_id);
    }

    if (req.query.min_score) {
      query = query.gte('ai_confidence_score', parseFloat(req.query.min_score as string));
    }

    const { data: pendingLeads, error } = await query;

    if (error) {
      console.error('❌ Error fetching pending leads:', error);
      return res.status(500).json({ error: 'Failed to fetch pending leads' });
    }

    // Calculate stats
    const stats = {
      total: pendingLeads?.length || 0,
      highConfidence: pendingLeads?.filter(l => (l.ai_confidence_score || 0) >= 0.8).length || 0,
      mediumConfidence: pendingLeads?.filter(l => (l.ai_confidence_score || 0) >= 0.6 && (l.ai_confidence_score || 0) < 0.8).length || 0,
      lowConfidence: pendingLeads?.filter(l => (l.ai_confidence_score || 0) < 0.6).length || 0
    };

    console.log(`✅ Fetched ${stats.total} pending leads for review`);

    res.json({
      pendingLeads: pendingLeads || [],
      stats,
      recommendations: {
        acceptAll: stats.highConfidence,
        reviewCarefully: stats.mediumConfidence,
        considerDeclining: stats.lowConfidence
      }
    });

  } catch (error) {
    console.error('❌ Error in pending leads endpoint:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/lead-review/bulk - Bulk review action
router.post('/bulk', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const userOrgId = req.user?.organizationId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { action, callIds, strategy } = req.body;
    
    // Validate action
    if (!['accept', 'decline'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be accept or decline' });
    }

    let targetCallIds = callIds;

    // If using strategy instead of specific IDs
    if (!callIds && strategy) {
      // Get calls based on strategy
      let strategyQuery = supabase
        .from('calls')
        .select('id')
        .eq('qualification_status', 'pending');

      if (userRole !== 'platform_owner') {
        strategyQuery = strategyQuery.eq('organization_id', userOrgId);
      }

      switch (strategy) {
        case 'ai_recommended':
          strategyQuery = strategyQuery.eq('ai_recommendation', 'accept');
          break;
        case 'high_confidence':
          strategyQuery = strategyQuery.gte('ai_confidence_score', 0.8);
          break;
        case 'all':
          // No additional filter
          break;
        default:
          return res.status(400).json({ error: 'Invalid strategy' });
      }

      const { data: strategyCallIds } = await strategyQuery;
      targetCallIds = strategyCallIds?.map(c => c.id) || [];
    }

    if (!targetCallIds || targetCallIds.length === 0) {
      return res.status(400).json({ error: 'No calls to process' });
    }

    // Update calls with review decision
    const newStatus = action === 'accept' ? 'accepted' : 'declined';
    
    const { error: updateError } = await supabase
      .from('calls')
      .update({
        qualification_status: newStatus,
        human_reviewed: true,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString()
      })
      .in('id', targetCallIds);

    if (updateError) {
      console.error('❌ Error updating calls:', updateError);
      return res.status(500).json({ error: 'Failed to update calls' });
    }

    // If accepting, create CRM contacts
    let crmContactsCreated = 0;
    if (action === 'accept') {
      const { data: acceptedCalls } = await supabase
        .from('calls')
        .select('*')
        .in('id', targetCallIds);

      for (const call of acceptedCalls || []) {
        try {
          await createCRMContactFromCall(call);
          crmContactsCreated++;
          
          // Mark call as having created CRM contact
          await supabase
            .from('calls')
            .update({ created_crm_contact: true })
            .eq('id', call.id);
            
        } catch (crmError) {
          console.error(`❌ Failed to create CRM contact for call ${call.id}:`, crmError);
        }
      }
    }

    console.log(`✅ Bulk ${action} completed: ${targetCallIds.length} calls processed, ${crmContactsCreated} CRM contacts created`);

    res.json({
      success: true,
      processed: targetCallIds.length,
      action: newStatus,
      crmContactsCreated
    });

  } catch (error) {
    console.error('❌ Error in bulk review:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/lead-review/:callId/accept - Accept individual lead
router.post('/:callId/accept', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { callId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const userOrgId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get the call
    let query = supabase
      .from('calls')
      .select('*')
      .eq('id', callId);

    if (userRole !== 'platform_owner') {
      query = query.eq('organization_id', userOrgId);
    }

    const { data: call, error } = await query.single();

    if (error || !call) {
      return res.status(404).json({ error: 'Call not found or access denied' });
    }

    // Update call status
    await supabase
      .from('calls')
      .update({
        qualification_status: 'accepted',
        human_reviewed: true,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_notes: req.body.notes
      })
      .eq('id', callId);

    // Create CRM contact
    const crmContactId = await createCRMContactFromCall(call);
    
    // Mark call as having created CRM contact
    await supabase
      .from('calls')
      .update({ created_crm_contact: true })
      .eq('id', callId);

    console.log(`✅ Lead accepted: ${call.phone_number} -> CRM contact created`);

    res.json({
      success: true,
      message: 'Lead accepted and added to CRM',
      crmContactId
    });

  } catch (error) {
    console.error('❌ Error accepting lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/lead-review/:callId/decline - Decline individual lead
router.post('/:callId/decline', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { callId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Update call status
    const { error } = await supabase
      .from('calls')
      .update({
        qualification_status: 'declined',
        human_reviewed: true,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_notes: req.body.notes
      })
      .eq('id', callId);

    if (error) {
      return res.status(500).json({ error: 'Failed to update call status' });
    }

    console.log(`✅ Lead declined: Call ${callId}`);

    res.json({
      success: true,
      message: 'Lead declined'
    });

  } catch (error) {
    console.error('❌ Error declining lead:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/lead-review/stats - Get review statistics
router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userRole = req.user?.role;
    const userOrgId = req.user?.organizationId;

    let baseQuery = supabase.from('calls').select('qualification_status', { count: 'exact' });

    if (userRole !== 'platform_owner') {
      baseQuery = baseQuery.eq('organization_id', userOrgId);
    }

    const [pending, accepted, declined] = await Promise.all([
      baseQuery.eq('qualification_status', 'pending'),
      baseQuery.eq('qualification_status', 'accepted'),
      baseQuery.eq('qualification_status', 'declined')
    ]);

    res.json({
      stats: {
        pending: pending.count || 0,
        accepted: accepted.count || 0,
        declined: declined.count || 0,
        total: (pending.count || 0) + (accepted.count || 0) + (declined.count || 0)
      }
    });

  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;