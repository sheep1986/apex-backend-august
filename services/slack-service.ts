interface SlackMessage {
  text: string;
  channel?: string;
  attachments?: Array<{
    color?: string;
    title?: string;
    text?: string;
    fields?: Array<{
      title: string;
      value: string;
      short?: boolean;
    }>;
    footer?: string;
    ts?: number;
  }>;
  blocks?: Array<any>;
}

interface DirectMessage {
  text: string;
  blocks?: Array<any>;
}

class SlackService {
  private webhookUrl: string | undefined;

  constructor() {
    this.webhookUrl = process.env.SLACK_WEBHOOK_URL;
  }

  async sendNotification(message: SlackMessage): Promise<boolean> {
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
    } catch (error) {
      console.error('Failed to send Slack notification:', error);
      return false;
    }
  }

  async sendDirectMessage(userId: string, message: DirectMessage): Promise<boolean> {
    // In production, this would use Slack's Web API to send a DM
    // For now, we'll send to the webhook as a regular message
    return this.sendNotification({
      text: message.text,
      blocks: message.blocks,
      channel: `@${userId}`,
    });
  }

  async sendLeadNotification(lead: {
    name: string;
    status: string;
    campaign: string;
    assignedTo?: string;
    outcome?: string;
  }): Promise<boolean> {
    const color = lead.status === 'converted' ? 'good' : 
                  lead.status === 'interested' ? 'warning' : 
                  '#439FE0';

    const message: SlackMessage = {
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

// Export singleton instance
export const slackService = new SlackService(); 