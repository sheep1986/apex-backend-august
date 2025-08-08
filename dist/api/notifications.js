"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const auth_1 = require("../middleware/auth");
const slack_service_1 = require("../services/slack-service");
const router = (0, express_1.Router)();
router.get('/', auth_1.authenticateUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        const { data, error } = await supabase_client_1.default
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);
        if (error)
            throw error;
        res.json(data || []);
    }
    catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});
router.post('/', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { title, message, type, category, priority, metadata, action } = req.body;
        const { data, error } = await supabase_client_1.default
            .from('notifications')
            .insert({
            user_id: userId,
            title,
            message,
            type: type || 'info',
            category,
            priority: priority || 'medium',
            metadata,
            action,
            read: false,
            created_at: new Date().toISOString(),
        })
            .select()
            .single();
        if (error) {
            console.error('Error creating notification:', error);
            return res.status(500).json({ error: 'Failed to create notification' });
        }
        res.status(201).json(data);
    }
    catch (error) {
        console.error('Error in create notification route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.put('/:id/read', auth_1.authenticateUser, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const { error } = await supabase_client_1.default
            .from('notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('id', id)
            .eq('user_id', userId);
        if (error)
            throw error;
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Failed to update notification' });
    }
});
router.put('/read-all', auth_1.authenticateUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        const { error } = await supabase_client_1.default
            .from('notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('is_read', false);
        if (error)
            throw error;
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ error: 'Failed to update notifications' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const userId = req.user?.id;
        const notificationId = req.params.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { error } = await supabase_client_1.default
            .from('notifications')
            .delete()
            .eq('id', notificationId)
            .eq('user_id', userId);
        if (error) {
            console.error('Error deleting notification:', error);
            return res.status(500).json({ error: 'Failed to delete notification' });
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error in delete notification route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/preferences', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { data, error } = await supabase_client_1.default
            .from('notification_preferences')
            .select('*')
            .eq('user_id', userId)
            .single();
        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching preferences:', error);
            return res.status(500).json({ error: 'Failed to fetch preferences' });
        }
        if (!data) {
            const defaultPreferences = {
                email_notifications: true,
                push_notifications: true,
                sms_notifications: false,
                in_app_notifications: true,
                categories: {
                    campaigns: true,
                    system: true,
                    billing: true,
                    performance: true,
                    calls: true,
                },
                quiet_hours: {
                    enabled: false,
                    start: '22:00',
                    end: '08:00',
                },
            };
            return res.json(defaultPreferences);
        }
        res.json(data);
    }
    catch (error) {
        console.error('Error in get preferences route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.put('/preferences', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const preferences = req.body;
        const { data, error } = await supabase_client_1.default
            .from('notification_preferences')
            .upsert({
            user_id: userId,
            ...preferences,
            updated_at: new Date().toISOString(),
        })
            .select()
            .single();
        if (error) {
            console.error('Error updating preferences:', error);
            return res.status(500).json({ error: 'Failed to update preferences' });
        }
        res.json(data);
    }
    catch (error) {
        console.error('Error in update preferences route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/follow-up-reminder', auth_1.authenticateUser, async (req, res) => {
    try {
        const { leadId, leadName, scheduledTime, notes } = req.body;
        const userId = req.user?.id;
        const notification = {
            user_id: userId,
            type: 'follow_up_reminder',
            title: 'Follow-up Call Reminder',
            message: `Scheduled follow-up call with ${leadName}`,
            metadata: {
                lead_id: leadId,
                lead_name: leadName,
                scheduled_time: scheduledTime,
                notes: notes
            },
            action_url: `/leads/${leadId}`,
            is_read: false,
            created_at: new Date().toISOString()
        };
        const { data, error } = await supabase_client_1.default
            .from('notifications')
            .insert(notification)
            .select()
            .single();
        if (error)
            throw error;
        if (req.user?.slack_id) {
            await slack_service_1.slackService.sendDirectMessage(req.user.slack_id, {
                text: `🔔 Follow-up Reminder: ${leadName}`,
                blocks: [
                    {
                        type: 'section',
                        text: {
                            type: 'mrkdwn',
                            text: `*Follow-up Call Reminder*\n*Lead:* ${leadName}\n*Time:* ${new Date(scheduledTime).toLocaleString()}\n*Notes:* ${notes || 'No notes'}`
                        }
                    },
                    {
                        type: 'actions',
                        elements: [
                            {
                                type: 'button',
                                text: { type: 'plain_text', text: 'View Lead' },
                                url: `${process.env.FRONTEND_URL}/leads/${leadId}`
                            }
                        ]
                    }
                ]
            });
        }
        res.json(data);
    }
    catch (error) {
        console.error('Error creating follow-up reminder:', error);
        res.status(500).json({ error: 'Failed to create reminder' });
    }
});
router.post('/lead-status', auth_1.authenticateUser, async (req, res) => {
    try {
        const { leadId, leadName, status, outcome, assignedTo } = req.body;
        if (assignedTo) {
            const notification = {
                user_id: assignedTo,
                type: 'lead_status_update',
                title: 'Lead Status Update',
                message: `${leadName} status updated to ${status}${outcome ? ` - ${outcome}` : ''}`,
                metadata: {
                    lead_id: leadId,
                    lead_name: leadName,
                    status: status,
                    outcome: outcome
                },
                action_url: `/leads/${leadId}`,
                is_read: false,
                created_at: new Date().toISOString()
            };
            const { error } = await supabase_client_1.default
                .from('notifications')
                .insert(notification);
            if (error)
                throw error;
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error creating lead status notification:', error);
        res.status(500).json({ error: 'Failed to create notification' });
    }
});
router.get('/unread-count', auth_1.authenticateUser, async (req, res) => {
    try {
        const userId = req.user?.id;
        const { count, error } = await supabase_client_1.default
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false);
        if (error)
            throw error;
        res.json({ count: count || 0 });
    }
    catch (error) {
        console.error('Error fetching unread count:', error);
        res.status(500).json({ error: 'Failed to fetch unread count' });
    }
});
router.post('/schedule-reminders', auth_1.authenticateUser, async (req, res) => {
    try {
        const now = new Date();
        const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
        const { data: followups, error } = await supabase_client_1.default
            .from('scheduled_followups')
            .select(`
        *,
        lead:leads(first_name, last_name),
        assigned:users(id, email, slack_id)
      `)
            .gte('scheduled_time', now.toISOString())
            .lte('scheduled_time', oneHourFromNow.toISOString())
            .eq('reminder_sent', false)
            .eq('completed', false);
        if (error)
            throw error;
        for (const followup of followups || []) {
            if (followup.assigned_to) {
                const notification = {
                    user_id: followup.assigned_to,
                    type: 'follow_up_reminder',
                    title: 'Upcoming Follow-up Call',
                    message: `Follow-up call with ${followup.lead.first_name} ${followup.lead.last_name} in ${Math.round((new Date(followup.scheduled_time).getTime() - now.getTime()) / 60000)} minutes`,
                    metadata: {
                        lead_id: followup.lead_id,
                        followup_id: followup.id,
                        scheduled_time: followup.scheduled_time,
                        notes: followup.notes
                    },
                    action_url: `/leads/${followup.lead_id}`,
                    is_read: false,
                    created_at: new Date().toISOString()
                };
                await supabase_client_1.default.from('notifications').insert(notification);
                await supabase_client_1.default
                    .from('scheduled_followups')
                    .update({ reminder_sent: true })
                    .eq('id', followup.id);
                if (followup.assigned?.slack_id) {
                    await slack_service_1.slackService.sendDirectMessage(followup.assigned.slack_id, {
                        text: `⏰ Upcoming follow-up call with ${followup.lead.first_name} ${followup.lead.last_name}`,
                        blocks: [
                            {
                                type: 'section',
                                text: {
                                    type: 'mrkdwn',
                                    text: `*Reminder: Follow-up Call*\n*Lead:* ${followup.lead.first_name} ${followup.lead.last_name}\n*Time:* ${new Date(followup.scheduled_time).toLocaleString()}\n*Notes:* ${followup.notes || 'No notes'}`
                                }
                            }
                        ]
                    });
                }
            }
        }
        res.json({
            success: true,
            reminders_sent: followups?.length || 0
        });
    }
    catch (error) {
        console.error('Error scheduling reminders:', error);
        res.status(500).json({ error: 'Failed to schedule reminders' });
    }
});
exports.default = router;
