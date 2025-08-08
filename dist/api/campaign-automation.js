"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const campaign_executor_1 = require("../services/campaign-executor");
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const router = (0, express_1.Router)();
router.post('/:campaignId/start', async (req, res) => {
    try {
        const { campaignId } = req.params;
        const { data: campaign, error } = await supabase_client_1.default
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
        await supabase_client_1.default
            .from('campaigns')
            .update({
            status: 'active',
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
            .eq('id', campaignId);
        res.json({
            success: true,
            message: 'Campaign started successfully',
            campaignId,
            status: 'active'
        });
    }
    catch (error) {
        console.error('❌ Error starting campaign:', error);
        res.status(500).json({ error: 'Failed to start campaign' });
    }
});
router.post('/:campaignId/pause', async (req, res) => {
    try {
        const { campaignId } = req.params;
        await campaign_executor_1.campaignExecutor.pauseCampaign(campaignId);
        res.json({
            success: true,
            message: 'Campaign paused successfully',
            campaignId,
            status: 'paused'
        });
    }
    catch (error) {
        console.error('❌ Error pausing campaign:', error);
        res.status(500).json({ error: 'Failed to pause campaign' });
    }
});
router.post('/:campaignId/resume', async (req, res) => {
    try {
        const { campaignId } = req.params;
        await campaign_executor_1.campaignExecutor.resumeCampaign(campaignId);
        res.json({
            success: true,
            message: 'Campaign resumed successfully',
            campaignId,
            status: 'active'
        });
    }
    catch (error) {
        console.error('❌ Error resuming campaign:', error);
        res.status(500).json({ error: 'Failed to resume campaign' });
    }
});
router.get('/:campaignId/status', async (req, res) => {
    try {
        const { campaignId } = req.params;
        const status = await campaign_executor_1.campaignExecutor.getCampaignStatus(campaignId);
        if (!status.campaign) {
            return res.status(404).json({ error: 'Campaign not found' });
        }
        res.json(status);
    }
    catch (error) {
        console.error('❌ Error getting campaign status:', error);
        res.status(500).json({ error: 'Failed to get campaign status' });
    }
});
router.get('/:campaignId/live', async (req, res) => {
    try {
        const { campaignId } = req.params;
        const { data: queueData, error: queueError } = await supabase_client_1.default
            .from('call_queue')
            .select('*')
            .eq('campaign_id', campaignId);
        if (queueError) {
            return res.status(500).json({ error: 'Failed to get queue data' });
        }
        const today = new Date().toISOString().split('T')[0];
        const { data: todayCalls, error: callsError } = await supabase_client_1.default
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
        const activeCalls = queue.filter(q => q.status === 'calling').map(q => ({
            id: q.last_call_id || q.id,
            leadName: q.contact_name,
            phone: q.phone_number,
            duration: 0,
            status: 'in-progress',
            assistantName: 'AI Assistant',
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
    }
    catch (error) {
        console.error('❌ Error getting live monitoring:', error);
        res.status(500).json({ error: 'Failed to get live monitoring data' });
    }
});
router.post('/:campaignId/upload-contacts', async (req, res) => {
    try {
        const { campaignId } = req.params;
        const { contacts } = req.body;
        if (!contacts || !Array.isArray(contacts)) {
            return res.status(400).json({ error: 'Contacts array is required' });
        }
        const validContacts = [];
        const errors = [];
        for (let i = 0; i < contacts.length; i++) {
            const contact = contacts[i];
            const rowErrors = [];
            if (!contact.phone)
                rowErrors.push('Phone number is required');
            if (!contact.first_name && !contact.name)
                rowErrors.push('Name is required');
            if (rowErrors.length > 0) {
                errors.push({ row: i + 1, errors: rowErrors });
            }
            else {
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
        if (validContacts.length > 0) {
            const { error: insertError } = await supabase_client_1.default
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
    }
    catch (error) {
        console.error('❌ Error uploading contacts:', error);
        res.status(500).json({ error: 'Failed to upload contacts' });
    }
});
router.get('/:campaignId/analytics', async (req, res) => {
    try {
        const { campaignId } = req.params;
        const { days = 7 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));
        const { data: calls, error } = await supabase_client_1.default
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
            }, {}) || {},
            callsByHour: generateCallsByHour(calls || []),
            sentimentAnalysis: {
                positive: 0,
                neutral: 0,
                negative: 0
            }
        };
        res.json(analytics);
    }
    catch (error) {
        console.error('❌ Error getting analytics:', error);
        res.status(500).json({ error: 'Failed to get analytics' });
    }
});
function calculateEstimatedCompletion(queue) {
    const pending = queue.filter(q => q.status === 'pending').length;
    if (pending === 0)
        return 'Completed';
    const hoursRemaining = Math.ceil(pending / 10);
    const completionDate = new Date();
    completionDate.setHours(completionDate.getHours() + hoursRemaining);
    return completionDate.toISOString();
}
function calculateCallsPerHour(calls) {
    if (calls.length === 0)
        return 0;
    const lastHour = new Date();
    lastHour.setHours(lastHour.getHours() - 1);
    const callsLastHour = calls.filter(call => new Date(call.call_started_at) > lastHour);
    return callsLastHour.length;
}
function generateCallsByHour(calls) {
    const hourCounts = {};
    calls.forEach(call => {
        const hour = new Date(call.call_started_at).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    const result = [];
    for (let hour = 0; hour < 24; hour++) {
        result.push({ hour, count: hourCounts[hour] || 0 });
    }
    return result;
}
exports.default = router;
