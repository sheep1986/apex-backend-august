"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slackService = void 0;
class SlackService {
    constructor() {
        this.webhookUrl = process.env.SLACK_WEBHOOK_URL;
    }
    async sendNotification(message) {
        if (!this.webhookUrl) {
            console.warn('Slack webhook URL not configured');
            return false;
        }
        try {
            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(message),
            });
            return response.ok;
        }
        catch (error) {
            console.error('Failed to send Slack notification:', error);
            return false;
        }
    }
    async sendDirectMessage(userId, message) {
        return this.sendNotification({
            text: message.text,
            blocks: message.blocks,
            channel: `@${userId}`,
        });
    }
    async sendLeadNotification(lead) {
        const color = lead.status === 'converted' ? 'good' :
            lead.status === 'interested' ? 'warning' :
                '#439FE0';
        const message = {
            text: `Lead Update: ${lead.name}`,
            attachments: [{
                    color,
                    title: `Lead: ${lead.name}`,
                    fields: [
                        {
                            title: 'Status',
                            value: lead.status,
                            short: true
                        },
                        {
                            title: 'Campaign',
                            value: lead.campaign,
                            short: true
                        },
                        ...(lead.outcome ? [{
                                title: 'Outcome',
                                value: lead.outcome,
                                short: true
                            }] : []),
                        ...(lead.assignedTo ? [{
                                title: 'Assigned To',
                                value: lead.assignedTo,
                                short: true
                            }] : [])
                    ],
                    footer: 'Apex AI Calling Platform',
                    ts: Date.now() / 1000
                }]
        };
        return this.sendNotification(message);
    }
}
exports.slackService = new SlackService();
