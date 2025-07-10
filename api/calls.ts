import { Router } from 'express';
import { supabaseService } from '../services/supabase-client';
import { authenticateUser, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Get all calls with filtering, pagination, and search
router.get('/', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search = '',
      type = 'all',
      outcome = 'all',
      sentiment = 'all',
      agent = 'all',
      campaign = 'all',
      dateRange = 'all',
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query;

    const offset = (Number(page) - 1) * Number(limit);
    
    let query = supabaseService.client
      .from('calls')
      .select(`
        *,
        campaigns(name, id),
        leads(first_name, last_name, phone, company),
        users(first_name, last_name)
      `)
      .eq('organization_id', req.user?.organizationId);

    // Apply filters
    if (search) {
      query = query.or(`
        leads.first_name.ilike.%${search}%,
        leads.last_name.ilike.%${search}%,
        leads.phone.ilike.%${search}%,
        leads.company.ilike.%${search}%
      `);
    }

    if (type !== 'all') {
      query = query.eq('call_type', type);
    }

    if (outcome !== 'all') {
      query = query.eq('outcome', outcome);
    }

    if (sentiment !== 'all') {
      query = query.eq('sentiment', sentiment);
    }

    if (campaign !== 'all') {
      query = query.eq('campaign_id', campaign);
    }

    // Apply date range filter
    if (dateRange !== 'all') {
      const now = new Date();
      let startDate: Date;
      
      switch (dateRange) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'quarter':
          startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
          break;
        default:
          startDate = new Date(0);
      }
      
      query = query.gte('created_at', startDate.toISOString());
    }

    // Apply sorting
    const validSortFields = ['created_at', 'duration', 'cost', 'outcome'];
    const sortField = validSortFields.includes(sortBy as string) ? sortBy : 'created_at';
    const order = sortOrder === 'asc' ? 'asc' : 'desc';
    
    query = query.order(sortField as string, { ascending: order === 'asc' });

    // Apply pagination
    query = query.range(offset, offset + Number(limit) - 1);

    const { data: calls, error } = await query;

    if (error) {
      throw error;
    }

    // Transform data to match frontend interface
    const transformedCalls = calls?.map(call => ({
      id: call.id,
      type: call.call_type,
      contact: {
        name: call.leads ? `${call.leads.first_name} ${call.leads.last_name}` : 'Unknown',
        phone: call.leads?.phone || call.phone_number || 'Unknown',
        company: call.leads?.company
      },
      agent: {
        name: call.users ? `${call.users.first_name} ${call.users.last_name}` : call.agent_name || 'AI Agent',
        type: call.agent_type || 'ai'
      },
      campaign: call.campaigns ? {
        name: call.campaigns.name,
        id: call.campaigns.id
      } : undefined,
      startTime: call.created_at,
      duration: call.duration || 0,
      outcome: call.outcome,
      sentiment: call.sentiment || 'neutral',
      cost: call.cost || 0,
      recording: call.recording_url,
      transcript: call.transcript_url,
      notes: call.notes,
      leadId: call.lead_id,
      status: call.status || 'completed'
    })) || [];

    res.json({
      calls: transformedCalls,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: calls?.length || 0
      }
    });

  } catch (error) {
    console.error('❌ Error fetching calls:', error);
    res.status(500).json({ 
      error: 'Failed to fetch calls',
      message: error.message 
    });
  }
});

// Get call metrics
router.get('/metrics', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    const { data: calls, error } = await supabaseService.client
      .from('calls')
      .select('duration, cost, outcome, sentiment, created_at')
      .eq('organization_id', req.user?.organizationId);

    if (error) {
      throw error;
    }

    const totalCalls = calls?.length || 0;
    const connectedCalls = calls?.filter(call => 
      ['connected', 'interested', 'callback'].includes(call.outcome)
    ).length || 0;
    
    const totalDuration = calls?.reduce((sum, call) => sum + (call.duration || 0), 0) || 0;
    const totalCost = calls?.reduce((sum, call) => sum + (call.cost || 0), 0) || 0;
    const averageDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;
    const connectionRate = totalCalls > 0 ? (connectedCalls / totalCalls) * 100 : 0;
    
    const positiveCalls = calls?.filter(call => call.sentiment === 'positive').length || 0;
    const positiveRate = totalCalls > 0 ? (positiveCalls / totalCalls) * 100 : 0;

    res.json({
      totalCalls,
      connectedCalls,
      totalDuration,
      totalCost,
      averageDuration,
      connectionRate,
      positiveRate
    });

  } catch (error) {
    console.error('❌ Error fetching call metrics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch call metrics',
      message: error.message 
    });
  }
});

// Export calls to CSV
router.post('/export', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    const { filters = {}, search = '' } = req.body;

    let query = supabaseService.client
      .from('calls')
      .select(`
        *,
        campaigns(name),
        leads(first_name, last_name, phone, company),
        users(first_name, last_name)
      `)
      .eq('organization_id', req.user?.organizationId);

    // Apply same filters as the main query
    if (search) {
      query = query.or(`
        leads.first_name.ilike.%${search}%,
        leads.last_name.ilike.%${search}%,
        leads.phone.ilike.%${search}%,
        leads.company.ilike.%${search}%
      `);
    }

    const { data: calls, error } = await query;

    if (error) {
      throw error;
    }

    // Generate CSV
    const csvHeaders = [
      'Date',
      'Time',
      'Contact Name',
      'Phone',
      'Company',
      'Agent',
      'Campaign',
      'Duration',
      'Outcome',
      'Sentiment',
      'Cost',
      'Notes'
    ];

    const csvRows = calls?.map(call => [
      new Date(call.created_at).toLocaleDateString(),
      new Date(call.created_at).toLocaleTimeString(),
      call.leads ? `${call.leads.first_name} ${call.leads.last_name}` : 'Unknown',
      call.leads?.phone || call.phone_number || 'Unknown',
      call.leads?.company || '',
      call.users ? `${call.users.first_name} ${call.users.last_name}` : call.agent_name || 'AI Agent',
      call.campaigns?.name || '',
      call.duration || 0,
      call.outcome || '',
      call.sentiment || '',
      call.cost || 0,
      call.notes || ''
    ]) || [];

    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="calls-export-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);

  } catch (error) {
    console.error('❌ Error exporting calls:', error);
    res.status(500).json({ 
      error: 'Failed to export calls',
      message: error.message 
    });
  }
});

// Get call details by ID
router.get('/:id', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const { data: call, error } = await supabaseService.client
      .from('calls')
      .select(`
        *,
        campaigns(name, id),
        leads(first_name, last_name, phone, company, email),
        users(first_name, last_name)
      `)
      .eq('id', id)
      .eq('organization_id', req.user?.organizationId)
      .single();

    if (error) {
      throw error;
    }

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Transform data
    const transformedCall = {
      id: call.id,
      type: call.call_type,
      contact: {
        name: call.leads ? `${call.leads.first_name} ${call.leads.last_name}` : 'Unknown',
        phone: call.leads?.phone || call.phone_number || 'Unknown',
        email: call.leads?.email,
        company: call.leads?.company
      },
      agent: {
        name: call.users ? `${call.users.first_name} ${call.users.last_name}` : call.agent_name || 'AI Agent',
        type: call.agent_type || 'ai'
      },
      campaign: call.campaigns ? {
        name: call.campaigns.name,
        id: call.campaigns.id
      } : undefined,
      startTime: call.created_at,
      endTime: call.ended_at,
      duration: call.duration || 0,
      outcome: call.outcome,
      sentiment: call.sentiment || 'neutral',
      cost: call.cost || 0,
      recording: call.recording_url,
      transcript: call.transcript_url,
      notes: call.notes,
      leadId: call.lead_id,
      status: call.status || 'completed',
      metadata: call.metadata
    };

    res.json(transformedCall);

  } catch (error) {
    console.error('❌ Error fetching call details:', error);
    res.status(500).json({ 
      error: 'Failed to fetch call details',
      message: error.message 
    });
  }
});

// Create a new call (for manual entry or API integration)
router.post('/', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    const callData = {
      ...req.body,
      organization_id: req.user?.organizationId,
      created_by: req.user?.id,
      created_at: new Date().toISOString()
    };

    const { data: call, error } = await supabaseService.client
      .from('calls')
      .insert([callData])
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.status(201).json(call);

  } catch (error) {
    console.error('❌ Error creating call:', error);
    res.status(500).json({ 
      error: 'Failed to create call',
      message: error.message 
    });
  }
});

// Update call
router.put('/:id', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const updateData = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    const { data: call, error } = await supabaseService.client
      .from('calls')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', req.user?.organizationId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    res.json(call);

  } catch (error) {
    console.error('❌ Error updating call:', error);
    res.status(500).json({ 
      error: 'Failed to update call',
      message: error.message 
    });
  }
});

// Delete call
router.delete('/:id', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabaseService.client
      .from('calls')
      .delete()
      .eq('id', id)
      .eq('organization_id', req.user?.organizationId);

    if (error) {
      throw error;
    }

    res.json({ message: 'Call deleted successfully' });

  } catch (error) {
    console.error('❌ Error deleting call:', error);
    res.status(500).json({ 
      error: 'Failed to delete call',
      message: error.message 
    });
  }
});

// Call control actions - Hold call
router.post('/:id/hold', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    // Update call status to 'hold'
    const { data: call, error } = await supabaseService.client
      .from('calls')
      .update({ 
        status: 'hold',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', req.user?.organizationId)
      .select()
      .single();

    if (error || !call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // If this is a VAPI call, send hold command to VAPI
    if (call.vapi_call_id) {
      // TODO: Implement VAPI hold API
      console.log(`Sending hold command to VAPI for call ${call.vapi_call_id}`);
    }

    res.json({ 
      message: 'Call put on hold successfully',
      call: { id: call.id, status: call.status }
    });

  } catch (error) {
    console.error('❌ Error holding call:', error);
    res.status(500).json({ 
      error: 'Failed to hold call',
      message: error.message 
    });
  }
});

// Call control actions - End call
router.post('/:id/end', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    // Update call status to 'ended' and set end time
    const { data: call, error } = await supabaseService.client
      .from('calls')
      .update({ 
        status: 'ended',
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', req.user?.organizationId)
      .select()
      .single();

    if (error || !call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // If this is a VAPI call, send end command to VAPI
    if (call.vapi_call_id) {
      // TODO: Implement VAPI end call API
      console.log(`Sending end command to VAPI for call ${call.vapi_call_id}`);
    }

    res.json({ 
      message: 'Call ended successfully',
      call: { id: call.id, status: call.status, ended_at: call.ended_at }
    });

  } catch (error) {
    console.error('❌ Error ending call:', error);
    res.status(500).json({ 
      error: 'Failed to end call',
      message: error.message 
    });
  }
});

// Call control actions - Transfer call
router.post('/:id/transfer', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { transferTo, transferType = 'agent' } = req.body;

    if (!transferTo) {
      return res.status(400).json({ error: 'Transfer destination is required' });
    }

    // Update call status to 'transferring'
    const { data: call, error } = await supabaseService.client
      .from('calls')
      .update({ 
        status: 'transferring',
        transfer_to: transferTo,
        transfer_type: transferType,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('organization_id', req.user?.organizationId)
      .select()
      .single();

    if (error || !call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // If this is a VAPI call, send transfer command to VAPI
    if (call.vapi_call_id) {
      // TODO: Implement VAPI transfer API
      console.log(`Sending transfer command to VAPI for call ${call.vapi_call_id} to ${transferTo}`);
    }

    res.json({ 
      message: 'Call transfer initiated successfully',
      call: { 
        id: call.id, 
        status: call.status, 
        transfer_to: call.transfer_to,
        transfer_type: call.transfer_type
      }
    });

  } catch (error) {
    console.error('❌ Error transferring call:', error);
    res.status(500).json({ 
      error: 'Failed to transfer call',
      message: error.message 
    });
  }
});

// Get active calls (for live monitoring)
router.get('/active', authenticateUser, async (req: AuthenticatedRequest, res) => {
  try {
    const { data: calls, error } = await supabaseService.client
      .from('calls')
      .select(`
        *,
        campaigns(name, id),
        leads(first_name, last_name, phone, company),
        users(first_name, last_name)
      `)
      .eq('organization_id', req.user?.organizationId)
      .in('status', ['active', 'in_progress', 'connected', 'ringing', 'connecting', 'hold'])
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Transform data for live monitoring interface
    const activeCalls = calls?.map(call => ({
      id: call.id,
      vapiCallId: call.vapi_call_id,
      agent: {
        id: call.users?.id || 'ai',
        name: call.users ? `${call.users.first_name} ${call.users.last_name}` : call.agent_name || 'AI Agent',
        avatar: call.users?.avatar || '/avatars/ai-agent.png',
        department: call.agent_department || 'AI'
      },
      contact: {
        id: call.lead_id,
        name: call.leads ? `${call.leads.first_name} ${call.leads.last_name}` : 'Unknown Contact',
        phone: call.leads?.phone || call.phone_number || 'Unknown',
        company: call.leads?.company || 'Unknown Company'
      },
      campaign: {
        id: call.campaigns?.id || 'unknown',
        name: call.campaigns?.name || 'Unknown Campaign',
        type: call.campaign_type || 'Unknown'
      },
      status: call.status,
      startTime: call.created_at,
      duration: call.duration || 0,
      sentiment: call.sentiment || 'neutral',
      quality: call.call_quality || 'good',
      transcript: call.live_transcript || [],
      metrics: {
        talkRatio: call.talk_ratio || 0,
        objectionCount: call.objection_count || 0,
        positiveSignals: call.positive_signals || 0
      },
      recording: call.recording_url
    })) || [];

    res.json({ calls: activeCalls });

  } catch (error) {
    console.error('❌ Error fetching active calls:', error);
    res.status(500).json({ 
      error: 'Failed to fetch active calls',
      message: error.message 
    });
  }
});

export default router; 