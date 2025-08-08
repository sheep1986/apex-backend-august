"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallQueueService = void 0;
const events_1 = require("events");
const moment = __importStar(require("moment-timezone"));
class CallQueueService extends events_1.EventEmitter {
    constructor(pool) {
        super();
        this.isProcessing = false;
        this.processingInterval = null;
        this.PROCESSING_INTERVAL = 30000;
        this.MAX_CONCURRENT_CALLS = 10;
        this.CALL_SPACING_SECONDS = 30;
        this.MAX_DAILY_CALLS_PER_NUMBER = 100;
        this.pool = pool;
    }
    async start() {
        if (this.isProcessing) {
            return;
        }
        this.isProcessing = true;
        console.log('🚀 Call Queue Service started');
        await this.processQueue();
        this.processingInterval = setInterval(async () => {
            try {
                await this.processQueue();
            }
            catch (error) {
                console.error('Call queue processing error:', error);
                this.emit('error', error);
            }
        }, this.PROCESSING_INTERVAL);
    }
    async stop() {
        if (!this.isProcessing) {
            return;
        }
        this.isProcessing = false;
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
        console.log('🛑 Call Queue Service stopped');
    }
    async processQueue() {
        try {
            console.log('🔄 Processing call queue...');
            const activeCampaigns = await this.getActiveCampaigns();
            console.log(`📊 Found ${activeCampaigns.length} active campaigns`);
            for (const campaign of activeCampaigns) {
                await this.processCampaignQueue(campaign);
            }
            await this.updateQueueStatistics();
        }
        catch (error) {
            console.error('Queue processing error:', error);
            throw error;
        }
    }
    async processCampaignQueue(campaign) {
        try {
            console.log(`📞 Processing campaign: ${campaign.name}`);
            const availableNumbers = await this.getAvailablePhoneNumbers(campaign.id);
            if (availableNumbers.length === 0) {
                console.log(`⚠️  No available phone numbers for campaign ${campaign.name}`);
                return;
            }
            if (!this.isWithinCallingHours(campaign)) {
                console.log(`⏰ Campaign ${campaign.name} is outside calling hours`);
                return;
            }
            const leadsToCall = await this.getLeadsToCall(campaign, availableNumbers.length);
            if (leadsToCall.length === 0) {
                console.log(`📋 No leads ready for calling in campaign ${campaign.name}`);
                return;
            }
            console.log(`🎯 Found ${leadsToCall.length} leads to call for campaign ${campaign.name}`);
            await this.queueCalls(leadsToCall, availableNumbers, campaign);
        }
        catch (error) {
            console.error(`Error processing campaign ${campaign.name}:`, error);
        }
    }
    async getActiveCampaigns() {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
        SELECT 
          id, account_id, name, status, vapi_assistant_id,
          target_calls_per_day, max_attempts_per_lead, days_between_attempts,
          calling_hours, timezone_strategy
        FROM campaigns 
        WHERE status = 'active'
        AND vapi_assistant_id IS NOT NULL
        ORDER BY created_at ASC
      `);
            return result.rows;
        }
        finally {
            client.release();
        }
    }
    async getAvailablePhoneNumbers(campaignId) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
        SELECT 
          id, vapi_phone_number_id, phone_number, campaign_id,
          daily_call_count, total_call_count, answer_rate, health_score,
          status, last_call_at
        FROM campaign_phone_numbers
        WHERE campaign_id = $1
        AND status = 'active'
        AND daily_call_count < $2
        AND (last_call_at IS NULL OR last_call_at < NOW() - INTERVAL '${this.CALL_SPACING_SECONDS} seconds')
        ORDER BY health_score DESC, daily_call_count ASC
      `, [campaignId, this.MAX_DAILY_CALLS_PER_NUMBER]);
            return result.rows;
        }
        finally {
            client.release();
        }
    }
    isWithinCallingHours(campaign) {
        const now = moment();
        const callingHours = campaign.calling_hours || { start: 9, end: 17 };
        const currentHour = now.hour();
        return currentHour >= callingHours.start && currentHour < callingHours.end;
    }
    async getLeadsToCall(campaign, maxLeads) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
        SELECT 
          l.id, l.campaign_id, l.phone_number, l.first_name, l.last_name,
          l.timezone, l.status, l.priority_score, l.last_attempt_at,
          l.next_call_scheduled_at,
          COALESCE(
            (SELECT COUNT(*) FROM vapi_call_attempts vca WHERE vca.lead_id = l.id), 
            0
          ) as attempt_count
        FROM crm_leads l
        WHERE l.campaign_id = $1
        AND l.status IN ('new', 'contacted', 'callback')
        AND l.dnc_status = FALSE
        AND (
          l.next_call_scheduled_at IS NULL OR 
          l.next_call_scheduled_at <= NOW()
        )
        AND (
          SELECT COUNT(*) FROM vapi_call_attempts vca 
          WHERE vca.lead_id = l.id
        ) < $2
        AND NOT EXISTS (
          SELECT 1 FROM vapi_call_attempts vca2
          WHERE vca2.lead_id = l.id
          AND vca2.status IN ('initiated', 'ringing', 'connected')
        )
        ORDER BY 
          CASE 
            WHEN l.status = 'callback' THEN 1
            WHEN l.status = 'new' THEN 2
            WHEN l.status = 'contacted' THEN 3
          END,
          l.priority_score DESC,
          l.created_at ASC
        LIMIT $3
      `, [campaign.id, campaign.max_attempts_per_lead, maxLeads]);
            return result.rows;
        }
        finally {
            client.release();
        }
    }
    async queueCalls(leads, phoneNumbers, campaign) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (let i = 0; i < Math.min(leads.length, phoneNumbers.length); i++) {
                const lead = leads[i];
                const phoneNumber = phoneNumbers[i];
                const attemptNumber = lead.attempt_count + 1;
                const complianceCheck = await this.checkCompliance(lead, campaign);
                if (!complianceCheck.allowed) {
                    console.log(`🚫 Compliance check failed for lead ${lead.id}: ${complianceCheck.reason}`);
                    await this.logComplianceBlock(lead, complianceCheck.reason, complianceCheck.blocked_until);
                    continue;
                }
                const callAttemptId = await this.createCallAttempt(lead, campaign, phoneNumber, attemptNumber);
                const callResult = await this.initiateVapiCall(lead, campaign, phoneNumber, callAttemptId);
                if (callResult.success) {
                    console.log(`✅ Call queued for lead ${lead.first_name} ${lead.last_name} (${lead.phone_number})`);
                    await this.updatePhoneNumberUsage(phoneNumber.id);
                    await this.updateLeadStatus(lead.id, 'calling');
                    this.emit('call_queued', {
                        lead_id: lead.id,
                        campaign_id: campaign.id,
                        vapi_call_id: callResult.vapi_call_id,
                        attempt_number: attemptNumber
                    });
                }
                else {
                    console.error(`❌ Failed to queue call for lead ${lead.id}: ${callResult.error}`);
                    await this.updateCallAttempt(callAttemptId, {
                        status: 'failed',
                        error: callResult.error
                    });
                }
                if (i < Math.min(leads.length, phoneNumbers.length) - 1) {
                    await this.delay(this.CALL_SPACING_SECONDS * 1000);
                }
            }
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async checkCompliance(lead, campaign) {
        const client = await this.pool.connect();
        try {
            const complianceResult = await client.query(`
        SELECT * FROM compliance_logs
        WHERE phone_number = $1
        AND result = 'blocked'
        AND (blocked_until IS NULL OR blocked_until > NOW())
        ORDER BY created_at DESC
        LIMIT 1
      `, [lead.phone_number]);
            if (complianceResult.rows.length > 0) {
                const block = complianceResult.rows[0];
                return {
                    allowed: false,
                    reason: block.reason,
                    blocked_until: block.blocked_until
                };
            }
            const recentCallsResult = await client.query(`
        SELECT COUNT(*) as call_count
        FROM vapi_call_attempts
        WHERE lead_id = $1
        AND created_at > NOW() - INTERVAL '30 days'
      `, [lead.id]);
            const recentCalls = parseInt(recentCallsResult.rows[0].call_count);
            if (recentCalls >= campaign.max_attempts_per_lead) {
                return {
                    allowed: false,
                    reason: 'Maximum attempts reached',
                    blocked_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                };
            }
            const leadTimezone = lead.timezone || 'America/New_York';
            const leadTime = moment().tz(leadTimezone);
            const leadHour = leadTime.hour();
            const leadDay = leadTime.day();
            if (leadHour < 8 || leadHour >= 21) {
                const nextCallTime = leadHour < 8 ?
                    leadTime.clone().hour(8).minute(0).second(0) :
                    leadTime.clone().add(1, 'day').hour(8).minute(0).second(0);
                return {
                    allowed: false,
                    reason: 'Outside calling hours',
                    blocked_until: nextCallTime.toDate()
                };
            }
            if (leadDay === 0) {
                return {
                    allowed: false,
                    reason: 'Sunday restriction',
                    blocked_until: leadTime.clone().add(1, 'day').hour(8).minute(0).second(0).toDate()
                };
            }
            return { allowed: true };
        }
        finally {
            client.release();
        }
    }
    async logComplianceBlock(lead, reason, blockedUntil) {
        const client = await this.pool.connect();
        try {
            await client.query(`
        INSERT INTO compliance_logs (
          account_id, phone_number, campaign_id, action, result, reason, blocked_until, created_at
        ) VALUES (
          (SELECT account_id FROM campaigns WHERE id = $1),
          $2, $1, 'call_check', 'blocked', $3, $4, NOW()
        )
      `, [lead.campaign_id, lead.phone_number, reason, blockedUntil]);
        }
        finally {
            client.release();
        }
    }
    async createCallAttempt(lead, campaign, phoneNumber, attemptNumber) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
        INSERT INTO vapi_call_attempts (
          lead_id, campaign_id, account_id, phone_number_id, 
          vapi_assistant_id, attempt_number, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'initiated', NOW())
        RETURNING id
      `, [
                lead.id,
                campaign.id,
                campaign.account_id,
                phoneNumber.vapi_phone_number_id,
                campaign.vapi_assistant_id,
                attemptNumber
            ]);
            return result.rows[0].id;
        }
        finally {
            client.release();
        }
    }
    async initiateVapiCall(lead, campaign, phoneNumber, callAttemptId) {
        try {
            console.log(`🔄 Initiating VAPI call for ${lead.phone_number}`);
            await this.delay(1000);
            const mockVapiCallId = `vapi_call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await this.updateCallAttempt(callAttemptId, {
                vapi_call_id: mockVapiCallId,
                status: 'initiated',
                started_at: new Date()
            });
            return {
                success: true,
                vapi_call_id: mockVapiCallId,
                status: 'initiated'
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message,
                status: 'failed'
            };
        }
    }
    async updateCallAttempt(callAttemptId, updates) {
        const client = await this.pool.connect();
        try {
            const setClause = Object.keys(updates).map((key, index) => `${key} = $${index + 2}`).join(', ');
            if (setClause) {
                await client.query(`
          UPDATE vapi_call_attempts 
          SET ${setClause}
          WHERE id = $1
        `, [callAttemptId, ...Object.values(updates)]);
            }
        }
        finally {
            client.release();
        }
    }
    async updatePhoneNumberUsage(phoneNumberId) {
        const client = await this.pool.connect();
        try {
            await client.query(`
        UPDATE campaign_phone_numbers 
        SET 
          daily_call_count = daily_call_count + 1,
          total_call_count = total_call_count + 1,
          last_call_at = NOW()
        WHERE id = $1
      `, [phoneNumberId]);
        }
        finally {
            client.release();
        }
    }
    async updateLeadStatus(leadId, status) {
        const client = await this.pool.connect();
        try {
            await client.query(`
        UPDATE crm_leads 
        SET status = $1, last_attempt_at = NOW(), updated_at = NOW()
        WHERE id = $2
      `, [status, leadId]);
        }
        finally {
            client.release();
        }
    }
    async updateQueueStatistics() {
        const client = await this.pool.connect();
        try {
            const stats = await client.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'initiated') as initiated_calls,
          COUNT(*) FILTER (WHERE status = 'ringing') as ringing_calls,
          COUNT(*) FILTER (WHERE status = 'connected') as connected_calls,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_calls,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as calls_last_hour,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as calls_last_day
        FROM vapi_call_attempts
      `);
            this.emit('queue_stats', stats.rows[0]);
        }
        finally {
            client.release();
        }
    }
    async getQueueStats() {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'initiated') as initiated_calls,
          COUNT(*) FILTER (WHERE status = 'ringing') as ringing_calls,
          COUNT(*) FILTER (WHERE status = 'connected') as connected_calls,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_calls,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_calls,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as calls_last_hour,
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as calls_last_day,
          AVG(duration_seconds) FILTER (WHERE duration_seconds > 0) as avg_duration,
          SUM(cost) FILTER (WHERE cost > 0) as total_cost_today
        FROM vapi_call_attempts
        WHERE created_at > CURRENT_DATE
      `);
            return result.rows[0];
        }
        finally {
            client.release();
        }
    }
    async pauseCampaign(campaignId) {
        const client = await this.pool.connect();
        try {
            await client.query('UPDATE campaigns SET status = $1 WHERE id = $2', ['paused', campaignId]);
            console.log(`⏸️  Campaign ${campaignId} paused`);
        }
        finally {
            client.release();
        }
    }
    async resumeCampaign(campaignId) {
        const client = await this.pool.connect();
        try {
            await client.query('UPDATE campaigns SET status = $1 WHERE id = $2', ['active', campaignId]);
            console.log(`▶️  Campaign ${campaignId} resumed`);
        }
        finally {
            client.release();
        }
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async getActiveCalls() {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
        SELECT COUNT(*) as active_calls
        FROM vapi_call_attempts
        WHERE status IN ('initiated', 'ringing', 'connected')
      `);
            return parseInt(result.rows[0].active_calls);
        }
        finally {
            client.release();
        }
    }
    async processCallbacks() {
        const client = await this.pool.connect();
        try {
            const callbackLeads = await client.query(`
        SELECT * FROM crm_leads
        WHERE status = 'callback'
        AND next_call_scheduled_at <= NOW()
        ORDER BY next_call_scheduled_at ASC
        LIMIT 50
      `);
            for (const lead of callbackLeads.rows) {
                await client.query(`
          UPDATE crm_leads 
          SET status = 'contacted', next_call_scheduled_at = NULL
          WHERE id = $1
        `, [lead.id]);
                console.log(`🔄 Processed callback for lead ${lead.id}`);
            }
        }
        finally {
            client.release();
        }
    }
}
exports.CallQueueService = CallQueueService;
