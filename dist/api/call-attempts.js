"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const simple_auth_1 = require("../middleware/simple-auth");
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
async function createCRMContactFromCall(data) {
    const { phone_number, contact_name, campaign_id, organization_id, summary, sentiment, ai_confidence_score, outcome, duration, started_at, vapi_call_id, key_points, buying_signals, next_steps } = data;
    const nameParts = contact_name?.split(' ') || ['Unknown'];
    const first_name = nameParts[0] || 'Unknown';
    const last_name = nameParts.slice(1).join(' ') || '';
    const { data: existingContact } = await supabase_client_1.default
        .from('leads')
        .select('id, phone')
        .eq('phone', phone_number)
        .eq('organization_id', organization_id)
        .single();
    if (existingContact) {
        const { error: updateError } = await supabase_client_1.default
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
    }
    else {
        const { data: newContact, error: createError } = await supabase_client_1.default
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
const router = (0, express_1.Router)();
router.use(simple_auth_1.authenticateUser);
router.get('/:campaignId', async (req, res) => {
    try {
        const { campaignId } = req.params;
        const userId = req.user?.id;
        const userRole = req.user?.role;
        const userOrgId = req.user?.organizationId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        console.log(`🔍 Fetching call attempts for campaign ${campaignId} by user ${userId} (${userRole})`);
        let campaignQuery = supabase_client_1.default.from('campaigns').select('id, name, organization_id').eq('id', campaignId);
        if (userRole !== 'platform_owner') {
            campaignQuery = campaignQuery.eq('organization_id', userOrgId);
        }
        const { data: campaign, error: campaignError } = await campaignQuery.single();
        if (campaignError || !campaign) {
            return res.status(404).json({ error: 'Campaign not found or access denied' });
        }
        let query = supabase_client_1.default
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
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;
        query = query.range(offset, offset + limit - 1);
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
        const { count: totalCount } = await supabase_client_1.default
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
    }
    catch (error) {
        console.error('❌ Error in call attempts endpoint:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/:campaignId/analytics', async (req, res) => {
    try {
        const { campaignId } = req.params;
        const userId = req.user?.id;
        const userRole = req.user?.role;
        const userOrgId = req.user?.organizationId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        let campaignQuery = supabase_client_1.default.from('campaigns').select('id, name, organization_id').eq('id', campaignId);
        if (userRole !== 'platform_owner') {
            campaignQuery = campaignQuery.eq('organization_id', userOrgId);
        }
        const { data: campaign, error: campaignError } = await campaignQuery.single();
        if (campaignError || !campaign) {
            return res.status(404).json({ error: 'Campaign not found or access denied' });
        }
        const { data: analytics, error } = await supabase_client_1.default
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
        const { data: outcomeBreakdown } = await supabase_client_1.default
            .from('call_attempts')
            .select('outcome')
            .eq('campaign_id', campaignId);
        const outcomeStats = (outcomeBreakdown || []).reduce((acc, call) => {
            acc[call.outcome] = (acc[call.outcome] || 0) + 1;
            return acc;
        }, {});
        const { data: hourlyData } = await supabase_client_1.default
            .from('call_attempts')
            .select('call_started_at, outcome')
            .eq('campaign_id', campaignId);
        const hourlyStats = (hourlyData || []).reduce((acc, call) => {
            const hour = new Date(call.call_started_at).getHours();
            if (!acc[hour])
                acc[hour] = { total: 0, answered: 0, qualified: 0 };
            acc[hour].total++;
            if (call.outcome === 'answered')
                acc[hour].answered++;
            if (call.outcome === 'qualified')
                acc[hour].qualified++;
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
    }
    catch (error) {
        console.error('❌ Error in analytics endpoint:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/call/:callId/transcript', async (req, res) => {
    try {
        const { callId } = req.params;
        const userId = req.user?.id;
        const userRole = req.user?.role;
        const userOrgId = req.user?.organizationId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        let query = supabase_client_1.default
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
    }
    catch (error) {
        console.error('❌ Error fetching call transcript:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.post('/', async (req, res) => {
    try {
        const { campaign_id, phone_number, contact_name, vapi_call_id, vapi_assistant_id, call_started_at, call_ended_at, duration_seconds, outcome, outcome_reason, transcript, ai_sentiment_score, ai_qualification_score, ai_summary, ai_next_action, call_cost_usd, raw_vapi_data } = req.body;
        const { data: campaign, error: campaignError } = await supabase_client_1.default
            .from('campaigns')
            .select('organization_id')
            .eq('id', campaign_id)
            .single();
        if (campaignError || !campaign) {
            return res.status(400).json({ error: 'Invalid campaign_id' });
        }
        const is_qualified = outcome === 'qualified' || (ai_qualification_score && ai_qualification_score > 0.7);
        const { data: callAttempt, error } = await supabase_client_1.default
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
            }
            catch (crmError) {
                console.error('❌ Failed to create CRM contact:', crmError);
            }
        }
        res.status(201).json({
            success: true,
            callAttempt
        });
    }
    catch (error) {
        console.error('❌ Error in create call attempt endpoint:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.get('/:campaignId/export', async (req, res) => {
    try {
        const { campaignId } = req.params;
        const userId = req.user?.id;
        const userRole = req.user?.role;
        const userOrgId = req.user?.organizationId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        let campaignQuery = supabase_client_1.default.from('campaigns').select('id, name, organization_id').eq('id', campaignId);
        if (userRole !== 'platform_owner') {
            campaignQuery = campaignQuery.eq('organization_id', userOrgId);
        }
        const { data: campaign, error: campaignError } = await campaignQuery.single();
        if (campaignError || !campaign) {
            return res.status(404).json({ error: 'Campaign not found or access denied' });
        }
        let query = supabase_client_1.default
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
        const formatDuration = (seconds) => {
            if (seconds < 60)
                return `${seconds}s`;
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
            `"${(call.ai_summary || '').replace(/"/g, '""')}"`,
            `"${(call.ai_next_action || '').replace(/"/g, '""')}"`,
            call.call_cost_usd?.toFixed(4) || '0.0000',
            call.created_at
        ]);
        const csvContent = [
            csvHeaders.join(','),
            ...csvRows.map(row => row.join(','))
        ].join('\n');
        const fileName = `campaign-${campaign.name.replace(/[^a-zA-Z0-9]/g, '-')}-calls-${new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Pragma', 'no-cache');
        console.log(`✅ Exporting ${callAttempts?.length || 0} call attempts for campaign ${campaignId}`);
        res.send(csvContent);
    }
    catch (error) {
        console.error('❌ Error in export endpoint:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.post('/:campaignId/report', async (req, res) => {
    try {
        const { campaignId } = req.params;
        const userId = req.user?.id;
        const userRole = req.user?.role;
        const userOrgId = req.user?.organizationId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        let campaignQuery = supabase_client_1.default.from('campaigns').select('id, name, organization_id').eq('id', campaignId);
        if (userRole !== 'platform_owner') {
            campaignQuery = campaignQuery.eq('organization_id', userOrgId);
        }
        const { data: campaign, error: campaignError } = await campaignQuery.single();
        if (campaignError || !campaign) {
            return res.status(404).json({ error: 'Campaign not found or access denied' });
        }
        const { data: analytics, error: analyticsError } = await supabase_client_1.default
            .from('campaign_call_analytics')
            .select('*')
            .eq('campaign_id', campaignId)
            .single();
        if (analyticsError) {
            console.error('❌ Error fetching analytics for report:', analyticsError);
            return res.status(500).json({ error: 'Failed to fetch analytics data' });
        }
        const { data: recentCalls } = await supabase_client_1.default
            .from('call_attempts')
            .select('phone_number, contact_name, outcome, duration_seconds, ai_summary, call_started_at')
            .eq('campaign_id', campaignId)
            .order('call_started_at', { ascending: false })
            .limit(10);
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
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `attachment; filename="campaign-${campaign.name.replace(/[^a-zA-Z0-9]/g, '-')}-report.html"`);
        console.log(`✅ Generated report for campaign ${campaignId}`);
        res.send(htmlContent);
    }
    catch (error) {
        console.error('❌ Error generating report:', error);
        res.status(500).json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
router.post('/:callId/promote-to-crm', async (req, res) => {
    try {
        const { callId } = req.params;
        const userId = req.user?.id;
        const userRole = req.user?.role;
        const userOrgId = req.user?.organizationId;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        let query = supabase_client_1.default
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
        await supabase_client_1.default
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
    }
    catch (error) {
        console.error('❌ Error promoting call to CRM:', error);
        res.status(500).json({
            error: 'Failed to promote call to CRM',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.default = router;
