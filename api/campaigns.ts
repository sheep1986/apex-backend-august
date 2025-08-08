import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/clerk-auth';
import { createClient } from '@supabase/supabase-js';

const supabaseService = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const router = Router();

// Authentication is handled at the route level in server.ts

// GET /api/campaigns - Get all campaigns with filtering and pagination
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      industry, 
      search,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query;

    const userId = req.user?.id;
    const organizationId = req.user?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let query = supabaseService
      .from('campaigns')
      .select(`
        *,
        organization:organizations(name)
      `)
      .eq('organization_id', organizationId);

    // Apply filters
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (industry && industry !== 'all') {
      query = query.eq('industry', industry);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Apply sorting
    const validSortFields = ['created_at', 'updated_at', 'name', 'status'];
    const sortField = validSortFields.includes(sortBy as string) ? sortBy : 'created_at';
    const order = sortOrder === 'asc' ? 'asc' : 'desc';
    query = query.order(sortField as string, { ascending: order === 'asc' });

    // Apply pagination
    const offset = (Number(page) - 1) * Number(limit);
    query = query.range(offset, offset + Number(limit) - 1);

    const { data: campaigns, error, count } = await query;

    if (error) {
      console.error('Error fetching campaigns:', error);
      return res.status(500).json({ error: 'Failed to fetch campaigns' });
    }

    // Get campaign metrics and counts
    const campaignsWithMetrics = await Promise.all(
      (campaigns || []).map(async (campaign) => {
        // Get campaign metrics
        const { data: metrics } = await supabaseService
          .from('campaign_metrics')
          .select('*')
          .eq('campaign_id', campaign.id)
          .single();

        // Count leads for this campaign
        const { count: leadsCount } = await supabaseService
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id);

        // Count calls for this campaign
        const { count: callsCount } = await supabaseService
          .from('calls')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id);

        // Count successful/completed calls
        const { count: completedCallsCount } = await supabaseService
          .from('calls')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)
          .in('outcome', ['interested', 'appointment_scheduled', 'qualified']);

        // Get calls with cost calculation
        const { data: callsData } = await supabaseService
          .from('calls')
          .select('duration, cost, status, outcome')
          .eq('campaign_id', campaign.id);
        
        // Calculate total cost
        const totalCost = callsData?.reduce((sum, call) => {
          if (call.cost) return sum + call.cost;
          if (call.duration) return sum + (call.duration / 60 * 0.15); // $0.15 per minute
          return sum;
        }, 0) || 0;
        
        // Calculate conversion rate
        const conversionRate = callsCount && callsCount > 0 
          ? ((completedCallsCount || 0) / callsCount * 100).toFixed(1)
          : 0;
        
        // Determine if campaign is complete
        const leadGoal = campaign.lead_goal || 100; // Default to 100 if not set
        const isComplete = (leadsCount || 0) >= leadGoal && leadGoal > 0;
        const effectiveStatus = isComplete ? 'completed' : (campaign.status || 'active');

        return {
          ...campaign,
          status: effectiveStatus,
          lead_goal: leadGoal,
          spent: totalCost,
          leads_count: { count: leadsCount || 0 },
          calls_count: { count: callsCount || 0 },
          completed_calls_count: completedCallsCount || 0,
          conversion_rate: conversionRate,
          metrics: metrics || {
            total_calls: callsCount || 0,
            connected_calls: completedCallsCount || 0,
            conversion_rate: conversionRate,
            average_duration: 0,
            total_cost: totalCost
          }
        };
      })
    );

    res.json({
      campaigns: campaignsWithMetrics,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: count || 0,
        totalPages: Math.ceil((count || 0) / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error in campaigns GET:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/campaigns/:id - Get single campaign
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: campaign, error } = await supabaseService
      .from('campaigns')
      .select(`
        *,
        organization:organizations(name),
        leads:leads(count),
        calls:calls(count),
        campaign_metrics(*)
      `)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (error) {
      console.error('Error fetching campaign:', error);
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json({ campaign });
  } catch (error) {
    console.error('Error in campaign GET:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/campaigns - Create new campaign
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      name,
      description,
      type,
      industry,
      target_audience,
      script,
      voice_settings,
      schedule,
      budget,
      phone_numbers,
      status = 'draft',
      lead_goal,
      start_date,
      end_date,
      assistant_id,
      timezone,
      calling_hours,
      calling_days
    } = req.body;

    const userId = req.user?.id;
    const organizationId = req.user?.organizationId;

    if (!userId || !organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!name || !type) {
      return res.status(400).json({ error: 'Name and type are required' });
    }

    const { data: campaign, error } = await supabaseService
      .from('campaigns')
      .insert([{
        name,
        description,
        type,
        industry,
        target_audience,
        script,
        voice_settings,
        schedule,
        budget,
        phone_numbers,
        status,
        lead_goal: lead_goal || 100,
        start_date: start_date || null,
        end_date: end_date || null,
        assistant_id: assistant_id || null,
        timezone: timezone || 'America/New_York',
        calling_hours: calling_hours || '9:00 AM - 5:00 PM',
        calling_days: calling_days || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        organization_id: organizationId,
        created_by: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating campaign:', error);
      return res.status(500).json({ error: 'Failed to create campaign' });
    }

    // Initialize campaign metrics
    await supabaseService
      .from('campaign_metrics')
      .insert([{
        campaign_id: campaign.id,
        total_calls: 0,
        connected_calls: 0,
        conversion_rate: 0,
        average_duration: 0,
        total_cost: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]);

    res.status(201).json({ campaign });
  } catch (error) {
    console.error('Error in campaign POST:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/campaigns/:id - Update campaign
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Remove non-updatable fields
    delete updateData.id;
    delete updateData.created_at;
    delete updateData.organization_id;

    const { data: campaign, error } = await supabaseService
      .from('campaigns')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) {
      console.error('Error updating campaign:', error);
      return res.status(500).json({ error: 'Failed to update campaign' });
    }

    res.json({ campaign });
  } catch (error) {
    console.error('Error in campaign PUT:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/campaigns/:id - Delete campaign
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if campaign has active calls
    const { data: activeCalls } = await supabaseService
      .from('calls')
      .select('id')
      .eq('campaign_id', id)
      .eq('status', 'active');

    if (activeCalls && activeCalls.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete campaign with active calls. Please stop all calls first.' 
      });
    }

    const { error } = await supabaseService
      .from('campaigns')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) {
      console.error('Error deleting campaign:', error);
      return res.status(500).json({ error: 'Failed to delete campaign' });
    }

    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Error in campaign DELETE:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/campaigns/:id/start - Start campaign
router.post('/:id/start', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validate campaign can be started
    const { data: campaign } = await supabaseService
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status === 'active') {
      return res.status(400).json({ error: 'Campaign is already active' });
    }

    // Update campaign status
    const { data: updatedCampaign, error } = await supabaseService
      .from('campaigns')
      .update({
        status: 'active',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) {
      console.error('Error starting campaign:', error);
      return res.status(500).json({ error: 'Failed to start campaign' });
    }

    // TODO: Integrate with VAPI to actually start calling
    // This would involve creating VAPI assistants and starting call workflows

    res.json({ campaign: updatedCampaign, message: 'Campaign started successfully' });
  } catch (error) {
    console.error('Error in campaign start:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/campaigns/:id/pause - Pause campaign
router.post('/:id/pause', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: campaign, error } = await supabaseService
      .from('campaigns')
      .update({
        status: 'paused',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) {
      console.error('Error pausing campaign:', error);
      return res.status(500).json({ error: 'Failed to pause campaign' });
    }

    res.json({ campaign, message: 'Campaign paused successfully' });
  } catch (error) {
    console.error('Error in campaign pause:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/campaigns/:id/metrics - Get campaign metrics
router.get('/:id/metrics', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { timeframe = '7d' } = req.query;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get current metrics
    const { data: metrics } = await supabaseService
      .from('campaign_metrics')
      .select('*')
      .eq('campaign_id', id)
      .single();

    // Get historical data based on timeframe
    let dateFilter = new Date();
    switch (timeframe) {
      case '1d':
        dateFilter.setDate(dateFilter.getDate() - 1);
        break;
      case '7d':
        dateFilter.setDate(dateFilter.getDate() - 7);
        break;
      case '30d':
        dateFilter.setDate(dateFilter.getDate() - 30);
        break;
      default:
        dateFilter.setDate(dateFilter.getDate() - 7);
    }

    const { data: calls } = await supabaseService
      .from('calls')
      .select('*')
      .eq('campaign_id', id)
      .gte('created_at', dateFilter.toISOString());

    res.json({
      current: metrics,
      historical: calls,
      timeframe
    });
  } catch (error) {
    console.error('Error in campaign metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 