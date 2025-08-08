import { Router, Response } from 'express';
import { AuthenticatedRequest, authenticateUser } from '../middleware/simple-auth';
import supabase from '../services/supabase-client';

// CRM Integration Functions
interface CRMContactData {
  phone_number: string;
  contact_name?: string;
  campaign_id: string;
  organization_id: string;
  summary?: string;
  sentiment?: string;
  ai_confidence_score?: number;
  outcome?: string;
  duration: number;
  started_at: string;
  vapi_call_id?: string;
  key_points?: string;
  buying_signals?: string;
  next_steps?: string;
}

async function createCRMContactFromCall(data: CRMContactData) {
  const {
    phone_number,
    contact_name,
    campaign_id,
    organization_id,
    summary,
    sentiment,
    ai_confidence_score,
    outcome,
    duration,
    started_at,
    vapi_call_id,
    key_points,
    buying_signals,
    next_steps
  } = data;

  // Parse contact name into first/last name
  const nameParts = contact_name?.split(' ') || ['Unknown'];
  const first_name = nameParts[0] || 'Unknown';
  const last_name = nameParts.slice(1).join(' ') || '';

  // Check if contact already exists by phone number and organization
  const { data: existingContact } = await supabase
    .from('leads')
    .select('id, phone')
    .eq('phone', phone_number)
    .eq('organization_id', organization_id)
    .single();

  if (existingContact) {
    // Update existing contact with latest call info
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        qualification_status: 'qualified',
        call_status: outcome || 'completed',
        last_call_at: started_at,
        score: Math.round((ai_confidence_score || 0) * 100),
        custom_fields: {
          ...existingContact.custom_fields || {},
          ai_confidence_score,
          sentiment,
          summary,
          call_duration: duration,
          call_outcome: outcome,
          vapi_call_id,
          key_points,
          buying_signals,
          next_steps,
          last_qualification_date: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', existingContact.id);

    if (updateError) {
      throw new Error(`Failed to update existing CRM contact: ${updateError.message}`);
    }

    console.log(`✅ Updated existing CRM contact: ${phone_number}`);
    return existingContact;
  } else {
    // Create new CRM contact
    const { data: newContact, error: createError } = await supabase
      .from('leads')
      .insert({
        organization_id,
        campaign_id,
        first_name,
        last_name,
        phone: phone_number,
        qualification_status: 'qualified',
        lead_source: 'ai_call',
        lead_quality: 'high',
        call_status: outcome || 'completed',
        call_attempts: 1,
        last_call_at: started_at,
        score: Math.round((ai_confidence_score || 0) * 100),
        custom_fields: {
          ai_confidence_score,
          sentiment,
          summary,
          call_duration: duration,
          call_outcome: outcome,
          vapi_call_id,
          key_points,
          buying_signals,
          next_steps,
          created_from_call: true,
          qualification_date: new Date().toISOString()
        },
        status: 'qualified',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (createError) {
      throw new Error(`Failed to create CRM contact: ${createError.message}`);
    }

    console.log(`✅ Created new CRM contact: ${phone_number}`);
    return newContact;
  }
}

const router = Router();

// Apply authentication to all routes
router.use(authenticateUser);

// GET /api/call-attempts/:campaignId - Get all call attempts for a campaign
router.get('/:campaignId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const userOrgId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`🔍 Fetching call attempts for campaign ${campaignId} by user ${userId} (${userRole})`);

    // First verify user has access to this campaign
    let campaignQuery = supabase.from('campaigns').select('id, name, organization_id').eq('id', campaignId);
    
    // Apply role-based filtering
    if (userRole !== 'platform_owner') {
      campaignQuery = campaignQuery.eq('organization_id', userOrgId);
    }

    const { data: campaign, error: campaignError } = await campaignQuery.single();

    if (campaignError || !campaign) {
      return res.status(404).json({ error: 'Campaign not found or access denied' });
    }

    // Build call attempts query with filters
    let query = supabase
      .from('call_attempts')
      .select(`
        id,
        phone_number,
        contact_name,
        vapi_call_id,
        call_started_at,
        call_ended_at,
        duration_seconds,
        outcome,
        outcome_reason,
        ai_sentiment_score,
        ai_qualification_score,
        ai_summary,
        ai_next_action,
        is_qualified,
        qualification_notes,
        call_cost_usd,
        created_at
      `)
      .eq('campaign_id', campaignId)
      .order('call_started_at', { ascending: false });

    // Apply pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    
    query = query.range(offset, offset + limit - 1);

    // Apply filters from query params
    if (req.query.outcome) {
      query = query.eq('outcome', req.query.outcome);
    }
    
    if (req.query.qualified !== undefined) {
      query = query.eq('is_qualified', req.query.qualified === 'true');
    }

    if (req.query.date_from) {
      query = query.gte('call_started_at', req.query.date_from);
    }

    if (req.query.date_to) {
      query = query.lte('call_started_at', req.query.date_to);
    }

    const { data: callAttempts, error, count } = await query;

    if (error) {
      console.error('❌ Error fetching call attempts:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch call attempts',
        details: error.message 
      });
    }

    // Get total count for pagination
    const { count: totalCount } = await supabase
      .from('call_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId);

    console.log(`✅ Found ${callAttempts?.length || 0} call attempts for campaign ${campaignId}`);

    res.json({
      callAttempts: callAttempts || [],
      campaign: {
        id: campaign.id,
        name: campaign.name
      },
      pagination: {
        page,
        limit,
        total: totalCount || 0,
        totalPages: Math.ceil((totalCount || 0) / limit)
      }
    });

  } catch (error) {
    console.error('❌ Error in call attempts endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/call-attempts/:campaignId/analytics - Get campaign call analytics
router.get('/:campaignId/analytics', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const userOrgId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify access to campaign
    let campaignQuery = supabase.from('campaigns').select('id, name, organization_id').eq('id', campaignId);
    
    if (userRole !== 'platform_owner') {
      campaignQuery = campaignQuery.eq('organization_id', userOrgId);
    }

    const { data: campaign, error: campaignError } = await campaignQuery.single();

    if (campaignError || !campaign) {
      return res.status(404).json({ error: 'Campaign not found or access denied' });
    }

    // Use the analytics view we created in the schema
    const { data: analytics, error } = await supabase
      .from('campaign_call_analytics')
      .select('*')
      .eq('campaign_id', campaignId)
      .single();

    if (error) {
      console.error('❌ Error fetching campaign analytics:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch analytics',
        details: error.message 
      });
    }

    // Get additional breakdown by outcome
    const { data: outcomeBreakdown } = await supabase
      .from('call_attempts')
      .select('outcome')
      .eq('campaign_id', campaignId);

    const outcomeStats = (outcomeBreakdown || []).reduce((acc: any, call: any) => {
      acc[call.outcome] = (acc[call.outcome] || 0) + 1;
      return acc;
    }, {});

    // Get hourly distribution for timing insights
    const { data: hourlyData } = await supabase
      .from('call_attempts')
      .select('call_started_at, outcome')
      .eq('campaign_id', campaignId);

    const hourlyStats = (hourlyData || []).reduce((acc: any, call: any) => {
      const hour = new Date(call.call_started_at).getHours();
      if (!acc[hour]) acc[hour] = { total: 0, answered: 0, qualified: 0 };
      acc[hour].total++;
      if (call.outcome === 'answered') acc[hour].answered++;
      if (call.outcome === 'qualified') acc[hour].qualified++;
      return acc;
    }, {});

    res.json({
      campaign: {
        id: campaign.id,
        name: campaign.name
      },
      analytics: analytics || {
        total_calls: 0,
        answered_calls: 0,
        qualified_calls: 0,
        answer_rate: 0,
        qualification_rate: 0,
        total_cost_usd: 0,
        avg_sentiment_score: 0
      },
      breakdown: {
        outcomes: outcomeStats,
        hourly: hourlyStats
      }
    });

  } catch (error) {
    console.error('❌ Error in analytics endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/call-attempts/call/:callId/transcript - Get full transcript for a specific call
router.get('/call/:callId/transcript', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { callId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const userOrgId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Build query with role-based filtering
    let query = supabase
      .from('call_attempts')
      .select(`
        id,
        phone_number,
        contact_name,
        vapi_call_id,
        call_started_at,
        call_ended_at,
        duration_seconds,
        outcome,
        transcript,
        ai_summary,
        ai_sentiment_score,
        organization_id,
        campaign_id,
        campaigns!inner(name)
      `)
      .eq('id', callId);

    // Apply role-based filtering
    if (userRole !== 'platform_owner') {
      query = query.eq('organization_id', userOrgId);
    }

    const { data: callData, error } = await query.single();

    if (error || !callData) {
      return res.status(404).json({ error: 'Call not found or access denied' });
    }

    res.json({
      call: {
        id: callData.id,
        phone_number: callData.phone_number,
        contact_name: callData.contact_name,
        vapi_call_id: callData.vapi_call_id,
        call_started_at: callData.call_started_at,
        call_ended_at: callData.call_ended_at,
        duration_seconds: callData.duration_seconds,
        outcome: callData.outcome,
        ai_summary: callData.ai_summary,
        ai_sentiment_score: callData.ai_sentiment_score,
        campaign_name: callData.campaigns?.name
      },
      transcript: callData.transcript || []
    });

  } catch (error) {
    console.error('❌ Error fetching call transcript:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/call-attempts - Create new call attempt (webhook endpoint)
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      campaign_id,
      phone_number,
      contact_name,
      vapi_call_id,
      vapi_assistant_id,
      call_started_at,
      call_ended_at,
      duration_seconds,
      outcome,
      outcome_reason,
      transcript,
      ai_sentiment_score,
      ai_qualification_score,
      ai_summary,
      ai_next_action,
      call_cost_usd,
      raw_vapi_data
    } = req.body;

    // Get campaign to determine organization_id
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('organization_id')
      .eq('id', campaign_id)
      .single();

    if (campaignError || !campaign) {
      return res.status(400).json({ error: 'Invalid campaign_id' });
    }

    // Determine if this call should create a qualified lead
    const is_qualified = outcome === 'qualified' || (ai_qualification_score && ai_qualification_score > 0.7);

    const { data: callAttempt, error } = await supabase
      .from('call_attempts')
      .insert({
        campaign_id,
        organization_id: campaign.organization_id,
        phone_number,
        contact_name,
        vapi_call_id,
        vapi_assistant_id,
        call_started_at: call_started_at || new Date().toISOString(),
        call_ended_at,
        duration_seconds: duration_seconds || 0,
        outcome: outcome || 'failed',
        outcome_reason,
        transcript,
        ai_sentiment_score,
        ai_qualification_score,
        ai_summary,
        ai_next_action,
        is_qualified,
        call_cost_usd: call_cost_usd || 0,
        raw_vapi_data
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating call attempt:', error);
      return res.status(500).json({ 
        error: 'Failed to create call attempt',
        details: error.message 
      });
    }

    console.log(`✅ Call attempt recorded: ${callAttempt.id} for campaign ${campaign_id}`);

    // Auto-create CRM contact for qualified calls
    if (is_qualified) {
      try {
        await createCRMContactFromCall({
          phone_number,
          contact_name,
          campaign_id,
          organization_id: campaign.organization_id,
          ai_summary,
          ai_qualification_score,
          ai_sentiment_score,
          outcome,
          duration_seconds,
          call_started_at,
          vapi_call_id
        });
        console.log(`✅ Created CRM contact for qualified call: ${phone_number}`);
      } catch (crmError) {
        console.error('❌ Failed to create CRM contact:', crmError);
        // Don't fail the call attempt if CRM creation fails
      }
    }

    res.status(201).json({
      success: true,
      callAttempt
    });

  } catch (error) {
    console.error('❌ Error in create call attempt endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/call-attempts/:campaignId/export - Export call attempts as CSV
router.get('/:campaignId/export', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const userOrgId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify access to campaign
    let campaignQuery = supabase.from('campaigns').select('id, name, organization_id').eq('id', campaignId);
    
    if (userRole !== 'platform_owner') {
      campaignQuery = campaignQuery.eq('organization_id', userOrgId);
    }

    const { data: campaign, error: campaignError } = await campaignQuery.single();

    if (campaignError || !campaign) {
      return res.status(404).json({ error: 'Campaign not found or access denied' });
    }

    // Get all call attempts for the campaign
    let query = supabase
      .from('call_attempts')
      .select(`
        id,
        phone_number,
        contact_name,
        vapi_call_id,
        call_started_at,
        call_ended_at,
        duration_seconds,
        outcome,
        outcome_reason,
        ai_sentiment_score,
        ai_qualification_score,
        ai_summary,
        ai_next_action,
        is_qualified,
        qualification_notes,
        call_cost_usd,
        created_at
      `)
      .eq('campaign_id', campaignId)
      .order('call_started_at', { ascending: false });

    // Apply filters from query params (same as main endpoint)
    if (req.query.outcome) {
      query = query.eq('outcome', req.query.outcome);
    }
    
    if (req.query.qualified !== undefined) {
      query = query.eq('is_qualified', req.query.qualified === 'true');
    }

    if (req.query.date_from) {
      query = query.gte('call_started_at', req.query.date_from);
    }

    if (req.query.date_to) {
      query = query.lte('call_started_at', req.query.date_to);
    }

    const { data: callAttempts, error } = await query;

    if (error) {
      console.error('❌ Error fetching call attempts for export:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch call attempts',
        details: error.message 
      });
    }

    // Convert to CSV
    const csvHeaders = [
      'Call ID',
      'Phone Number',
      'Contact Name',
      'VAPI Call ID',
      'Call Started',
      'Call Ended',
      'Duration (seconds)',
      'Duration (formatted)',
      'Outcome',
      'Outcome Reason',
      'Qualified',
      'AI Sentiment Score',
      'AI Qualification Score',
      'AI Summary',
      'AI Next Action',
      'Call Cost (USD)',
      'Created At'
    ];

    const formatDuration = (seconds: number) => {
      if (seconds < 60) return `${seconds}s`;
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    };

    const csvRows = (callAttempts || []).map(call => [
      call.id,
      call.phone_number,
      call.contact_name || '',
      call.vapi_call_id || '',
      call.call_started_at,
      call.call_ended_at || '',
      call.duration_seconds,
      formatDuration(call.duration_seconds),
      call.outcome,
      call.outcome_reason || '',
      call.is_qualified ? 'Yes' : 'No',
      call.ai_sentiment_score?.toFixed(2) || '',
      call.ai_qualification_score?.toFixed(2) || '',
      `"${(call.ai_summary || '').replace(/"/g, '""')}"`, // Escape quotes
      `"${(call.ai_next_action || '').replace(/"/g, '""')}"`, // Escape quotes
      call.call_cost_usd?.toFixed(4) || '0.0000',
      call.created_at
    ]);

    // Create CSV content
    const csvContent = [
      csvHeaders.join(','),
      ...csvRows.map(row => row.join(','))
    ].join('\n');

    // Set headers for file download
    const fileName = `campaign-${campaign.name.replace(/[^a-zA-Z0-9]/g, '-')}-calls-${new Date().toISOString().split('T')[0]}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    console.log(`✅ Exporting ${callAttempts?.length || 0} call attempts for campaign ${campaignId}`);

    res.send(csvContent);

  } catch (error) {
    console.error('❌ Error in export endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/call-attempts/:campaignId/report - Generate PDF report
router.post('/:campaignId/report', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { campaignId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const userOrgId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify access to campaign
    let campaignQuery = supabase.from('campaigns').select('id, name, organization_id').eq('id', campaignId);
    
    if (userRole !== 'platform_owner') {
      campaignQuery = campaignQuery.eq('organization_id', userOrgId);
    }

    const { data: campaign, error: campaignError } = await campaignQuery.single();

    if (campaignError || !campaign) {
      return res.status(404).json({ error: 'Campaign not found or access denied' });
    }

    // Get analytics data
    const { data: analytics, error: analyticsError } = await supabase
      .from('campaign_call_analytics')
      .select('*')
      .eq('campaign_id', campaignId)
      .single();

    if (analyticsError) {
      console.error('❌ Error fetching analytics for report:', analyticsError);
      return res.status(500).json({ error: 'Failed to fetch analytics data' });
    }

    // Get recent call attempts for examples
    const { data: recentCalls } = await supabase
      .from('call_attempts')
      .select('phone_number, contact_name, outcome, duration_seconds, ai_summary, call_started_at')
      .eq('campaign_id', campaignId)
      .order('call_started_at', { ascending: false })
      .limit(10);

    // Generate HTML report content
    const reportDate = new Date().toLocaleDateString();
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Campaign Report - ${campaign.name}</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
            .metric-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin: 20px 0; }
            .metric-card { border: 1px solid #ddd; padding: 15px; border-radius: 8px; }
            .metric-value { font-size: 24px; font-weight: bold; color: #2563eb; }
            .metric-label { color: #666; font-size: 14px; }
            .section { margin: 30px 0; }
            .section-title { font-size: 18px; font-weight: bold; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
            .call-list { list-style: none; padding: 0; }
            .call-item { border: 1px solid #eee; margin: 5px 0; padding: 10px; border-radius: 4px; }
            .outcome-qualified { background-color: #dcfce7; }
            .outcome-answered { background-color: #dbeafe; }
            .outcome-voicemail { background-color: #fef3c7; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Campaign Performance Report</h1>
            <h2>${campaign.name}</h2>
            <p>Generated on ${reportDate}</p>
        </div>

        <div class="section">
            <div class="section-title">Executive Summary</div>
            <div class="metric-grid">
                <div class="metric-card">
                    <div class="metric-value">${analytics?.total_calls || 0}</div>
                    <div class="metric-label">Total Calls Made</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${analytics?.answer_rate?.toFixed(1) || 0}%</div>
                    <div class="metric-label">Answer Rate</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">${analytics?.qualification_rate?.toFixed(1) || 0}%</div>
                    <div class="metric-label">Qualification Rate</div>
                </div>
                <div class="metric-card">
                    <div class="metric-value">$${analytics?.total_cost_usd?.toFixed(2) || 0}</div>
                    <div class="metric-label">Total Campaign Cost</div>
                </div>
            </div>
        </div>

        <div class="section">
            <div class="section-title">Key Performance Indicators</div>
            <ul>
                <li><strong>Answered Calls:</strong> ${analytics?.answered_calls || 0} out of ${analytics?.total_calls || 0} (${analytics?.answer_rate?.toFixed(1) || 0}%)</li>
                <li><strong>Qualified Leads:</strong> ${analytics?.total_qualified || 0} leads generated</li>
                <li><strong>Cost per Qualified Lead:</strong> $${analytics?.total_qualified > 0 ? (analytics.total_cost_usd / analytics.total_qualified).toFixed(2) : '0.00'}</li>
                <li><strong>Average Call Duration:</strong> ${analytics?.total_calls > 0 ? Math.round((analytics.total_duration_seconds || 0) / analytics.total_calls) : 0} seconds</li>
                <li><strong>Average Sentiment Score:</strong> ${analytics?.avg_sentiment_score?.toFixed(2) || 'N/A'}</li>
            </ul>
        </div>

        ${recentCalls && recentCalls.length > 0 ? `
        <div class="section">
            <div class="section-title">Recent Call Examples</div>
            <ul class="call-list">
                ${recentCalls.map(call => `
                <li class="call-item outcome-${call.outcome}">
                    <strong>${call.contact_name || 'Unknown'}</strong> (${call.phone_number})<br>
                    <em>Outcome:</em> ${call.outcome} | <em>Duration:</em> ${call.duration_seconds}s<br>
                    ${call.ai_summary ? `<em>AI Summary:</em> ${call.ai_summary.substring(0, 200)}...` : ''}
                </li>
                `).join('')}
            </ul>
        </div>
        ` : ''}

        <div class="section">
            <div class="section-title">Recommendations</div>
            <ul>
                ${analytics?.answer_rate < 30 ? '<li>Consider adjusting call times or improving caller ID reputation to increase answer rates.</li>' : ''}
                ${analytics?.qualification_rate < 10 ? '<li>Review AI script and targeting criteria to improve qualification rates.</li>' : ''}
                ${analytics?.total_qualified > 0 && (analytics.total_cost_usd / analytics.total_qualified) > 50 ? '<li>Optimize call duration and targeting to reduce cost per qualified lead.</li>' : ''}
                ${analytics?.avg_sentiment_score < 0 ? '<li>Improve conversation flow and tone to achieve more positive interactions.</li>' : ''}
                <li>Continue monitoring performance and adjust strategy based on data insights.</li>
            </ul>
        </div>

        <div class="footer">
            <p>Report generated by Apex AI Voice Assistant Platform | ${new Date().toISOString()}</p>
        </div>
    </body>
    </html>
    `;

    // For now, return HTML content (you can integrate a PDF library like puppeteer later)
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="campaign-${campaign.name.replace(/[^a-zA-Z0-9]/g, '-')}-report.html"`);
    
    console.log(`✅ Generated report for campaign ${campaignId}`);
    
    res.send(htmlContent);

  } catch (error) {
    console.error('❌ Error generating report:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/call-attempts/:callId/promote-to-crm - Manually promote call to CRM
router.post('/:callId/promote-to-crm', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { callId } = req.params;
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const userOrgId = req.user?.organizationId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get the call attempt with role-based filtering
    let query = supabase
      .from('call_attempts')
      .select('*')
      .eq('id', callId);

    if (userRole !== 'platform_owner') {
      query = query.eq('organization_id', userOrgId);
    }

    const { data: callAttempt, error } = await query.single();

    if (error || !callAttempt) {
      return res.status(404).json({ error: 'Call attempt not found or access denied' });
    }

    // Create CRM contact from this call
    const crmContact = await createCRMContactFromCall({
      phone_number: callAttempt.phone_number,
      contact_name: callAttempt.contact_name,
      campaign_id: callAttempt.campaign_id,
      organization_id: callAttempt.organization_id,
      ai_summary: callAttempt.ai_summary,
      ai_qualification_score: callAttempt.ai_qualification_score,
      ai_sentiment_score: callAttempt.ai_sentiment_score,
      outcome: callAttempt.outcome,
      duration_seconds: callAttempt.duration_seconds,
      call_started_at: callAttempt.call_started_at,
      vapi_call_id: callAttempt.vapi_call_id
    });

    // Update call attempt to mark it as promoted to CRM
    await supabase
      .from('call_attempts')
      .update({ 
        is_qualified: true,
        created_crm_contact: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', callId);

    console.log(`✅ Manually promoted call ${callId} to CRM for phone ${callAttempt.phone_number}`);

    res.json({
      success: true,
      message: 'Call promoted to CRM successfully',
      crmContact
    });

  } catch (error) {
    console.error('❌ Error promoting call to CRM:', error);
    res.status(500).json({ 
      error: 'Failed to promote call to CRM',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;