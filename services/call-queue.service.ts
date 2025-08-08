import { Pool } from 'pg';
import { EventEmitter } from 'events';
import * as moment from 'moment-timezone';

interface Campaign {
  id: string;
  account_id: string;
  name: string;
  status: string;
  vapi_assistant_id: string;
  target_calls_per_day: number;
  max_attempts_per_lead: number;
  days_between_attempts: number;
  calling_hours: { start: number; end: number };
  timezone_strategy: string;
}

interface Lead {
  id: string;
  campaign_id: string;
  phone_number: string;
  first_name: string;
  last_name: string;
  timezone: string;
  status: string;
  priority_score: number;
  last_attempt_at: Date | null;
  next_call_scheduled_at: Date | null;
  attempt_count: number;
}

interface PhoneNumber {
  id: string;
  vapi_phone_number_id: string;
  phone_number: string;
  campaign_id: string;
  daily_call_count: number;
  total_call_count: number;
  answer_rate: number;
  health_score: number;
  status: string;
  last_call_at: Date | null;
}

interface CallQueueItem {
  id: string;
  lead_id: string;
  campaign_id: string;
  phone_number_id: string;
  assistant_id: string;
  attempt_number: number;
  scheduled_for: Date;
  priority: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

interface CallResult {
  success: boolean;
  vapi_call_id?: string;
  error?: string;
  duration?: number;
  cost?: number;
  status: string;
}

export class CallQueueService extends EventEmitter {
  private pool: Pool;
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly PROCESSING_INTERVAL = 30000; // 30 seconds
  private readonly MAX_CONCURRENT_CALLS = 10;
  private readonly CALL_SPACING_SECONDS = 30;
  private readonly MAX_DAILY_CALLS_PER_NUMBER = 100;

  constructor(pool: Pool) {
    super();
    this.pool = pool;
  }

  /**
   * Start the call queue processor
   */
  async start(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    console.log('🚀 Call Queue Service started');

    // Process queue immediately
    await this.processQueue();

    // Set up recurring processing
    this.processingInterval = setInterval(async () => {
      try {
        await this.processQueue();
      } catch (error) {
        console.error('Call queue processing error:', error);
        this.emit('error', error);
      }
    }, this.PROCESSING_INTERVAL);
  }

  /**
   * Stop the call queue processor
   */
  async stop(): Promise<void> {
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

  /**
   * Main queue processing logic
   */
  private async processQueue(): Promise<void> {
    try {
      console.log('🔄 Processing call queue...');

      // Get active campaigns
      const activeCampaigns = await this.getActiveCampaigns();
      console.log(`📊 Found ${activeCampaigns.length} active campaigns`);

      // Process each campaign
      for (const campaign of activeCampaigns) {
        await this.processCampaignQueue(campaign);
      }

      // Update queue statistics
      await this.updateQueueStatistics();

    } catch (error) {
      console.error('Queue processing error:', error);
      throw error;
    }
  }

  /**
   * Process queue for a specific campaign
   */
  private async processCampaignQueue(campaign: Campaign): Promise<void> {
    try {
      console.log(`📞 Processing campaign: ${campaign.name}`);

      // Get available phone numbers for this campaign
      const availableNumbers = await this.getAvailablePhoneNumbers(campaign.id);
      
      if (availableNumbers.length === 0) {
        console.log(`⚠️  No available phone numbers for campaign ${campaign.name}`);
        return;
      }

      // Check if we're within calling hours
      if (!this.isWithinCallingHours(campaign)) {
        console.log(`⏰ Campaign ${campaign.name} is outside calling hours`);
        return;
      }

      // Get leads ready to be called
      const leadsToCall = await this.getLeadsToCall(campaign, availableNumbers.length);
      
      if (leadsToCall.length === 0) {
        console.log(`📋 No leads ready for calling in campaign ${campaign.name}`);
        return;
      }

      console.log(`🎯 Found ${leadsToCall.length} leads to call for campaign ${campaign.name}`);

      // Queue calls with spacing
      await this.queueCalls(leadsToCall, availableNumbers, campaign);

    } catch (error) {
      console.error(`Error processing campaign ${campaign.name}:`, error);
    }
  }

  /**
   * Get active campaigns
   */
  private async getActiveCampaigns(): Promise<Campaign[]> {
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
    } finally {
      client.release();
    }
  }

  /**
   * Get available phone numbers for a campaign
   */
  private async getAvailablePhoneNumbers(campaignId: string): Promise<PhoneNumber[]> {
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
    } finally {
      client.release();
    }
  }

  /**
   * Check if campaign is within calling hours
   */
  private isWithinCallingHours(campaign: Campaign): boolean {
    const now = moment();
    const callingHours = campaign.calling_hours || { start: 9, end: 17 };
    
    // For now, use simple hour check - in production, implement proper timezone handling
    const currentHour = now.hour();
    
    return currentHour >= callingHours.start && currentHour < callingHours.end;
  }

  /**
   * Get leads ready to be called
   */
  private async getLeadsToCall(campaign: Campaign, maxLeads: number): Promise<Lead[]> {
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
    } finally {
      client.release();
    }
  }

  /**
   * Queue calls for leads
   */
  private async queueCalls(
    leads: Lead[], 
    phoneNumbers: PhoneNumber[], 
    campaign: Campaign
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      for (let i = 0; i < Math.min(leads.length, phoneNumbers.length); i++) {
        const lead = leads[i];
        const phoneNumber = phoneNumbers[i];
        const attemptNumber = lead.attempt_count + 1;
        
        // Check compliance before queueing
        const complianceCheck = await this.checkCompliance(lead, campaign);
        
        if (!complianceCheck.allowed) {
          console.log(`🚫 Compliance check failed for lead ${lead.id}: ${complianceCheck.reason}`);
          
          // Log compliance block
          await this.logComplianceBlock(lead, complianceCheck.reason, complianceCheck.blocked_until);
          continue;
        }

        // Create call attempt record
        const callAttemptId = await this.createCallAttempt(
          lead, 
          campaign, 
          phoneNumber, 
          attemptNumber
        );

        // Queue the call with VAPI
        const callResult = await this.initiateVapiCall(
          lead,
          campaign,
          phoneNumber,
          callAttemptId
        );

        if (callResult.success) {
          console.log(`✅ Call queued for lead ${lead.first_name} ${lead.last_name} (${lead.phone_number})`);
          
          // Update phone number usage
          await this.updatePhoneNumberUsage(phoneNumber.id);
          
          // Update lead status
          await this.updateLeadStatus(lead.id, 'calling');
          
          // Emit event
          this.emit('call_queued', {
            lead_id: lead.id,
            campaign_id: campaign.id,
            vapi_call_id: callResult.vapi_call_id,
            attempt_number: attemptNumber
          });
          
        } else {
          console.error(`❌ Failed to queue call for lead ${lead.id}: ${callResult.error}`);
          
          // Update call attempt with failure
          await this.updateCallAttempt(callAttemptId, {
            status: 'failed',
            error: callResult.error
          });
        }

        // Add delay between calls to respect spacing
        if (i < Math.min(leads.length, phoneNumbers.length) - 1) {
          await this.delay(this.CALL_SPACING_SECONDS * 1000);
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check compliance for a lead before calling
   */
  private async checkCompliance(lead: Lead, campaign: Campaign): Promise<{
    allowed: boolean;
    reason?: string;
    blocked_until?: Date;
  }> {
    const client = await this.pool.connect();
    
    try {
      // Check recent compliance blocks
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

      // Check call frequency limits
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
          blocked_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        };
      }

      // Check timezone calling hours
      const leadTimezone = lead.timezone || 'America/New_York';
      const leadTime = moment().tz(leadTimezone);
      const leadHour = leadTime.hour();
      const leadDay = leadTime.day(); // 0 = Sunday

      // TCPA compliance: 8 AM - 9 PM local time
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

      // Check Sunday restrictions (simplified)
      if (leadDay === 0) {
        return {
          allowed: false,
          reason: 'Sunday restriction',
          blocked_until: leadTime.clone().add(1, 'day').hour(8).minute(0).second(0).toDate()
        };
      }

      return { allowed: true };
      
    } finally {
      client.release();
    }
  }

  /**
   * Log compliance block
   */
  private async logComplianceBlock(
    lead: Lead, 
    reason: string, 
    blockedUntil?: Date
  ): Promise<void> {
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
    } finally {
      client.release();
    }
  }

  /**
   * Create call attempt record
   */
  private async createCallAttempt(
    lead: Lead,
    campaign: Campaign,
    phoneNumber: PhoneNumber,
    attemptNumber: number
  ): Promise<string> {
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
    } finally {
      client.release();
    }
  }

  /**
   * Initiate VAPI call (mock implementation - integrate with actual VAPI service)
   */
  private async initiateVapiCall(
    lead: Lead,
    campaign: Campaign,
    phoneNumber: PhoneNumber,
    callAttemptId: string
  ): Promise<CallResult> {
    try {
      // Mock VAPI call initiation
      // In production, this would call the actual VAPI service
      console.log(`🔄 Initiating VAPI call for ${lead.phone_number}`);
      
      // Simulate API call
      await this.delay(1000);
      
      const mockVapiCallId = `vapi_call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Update call attempt with VAPI call ID
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
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: 'failed'
      };
    }
  }

  /**
   * Update call attempt record
   */
  private async updateCallAttempt(
    callAttemptId: string,
    updates: {
      vapi_call_id?: string;
      status?: string;
      started_at?: Date;
      ended_at?: Date;
      duration_seconds?: number;
      cost?: number;
      error?: string;
    }
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const setClause = Object.keys(updates).map((key, index) => 
        `${key} = $${index + 2}`
      ).join(', ');
      
      if (setClause) {
        await client.query(`
          UPDATE vapi_call_attempts 
          SET ${setClause}
          WHERE id = $1
        `, [callAttemptId, ...Object.values(updates)]);
      }
    } finally {
      client.release();
    }
  }

  /**
   * Update phone number usage
   */
  private async updatePhoneNumberUsage(phoneNumberId: string): Promise<void> {
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
    } finally {
      client.release();
    }
  }

  /**
   * Update lead status
   */
  private async updateLeadStatus(leadId: string, status: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        UPDATE crm_leads 
        SET status = $1, last_attempt_at = NOW(), updated_at = NOW()
        WHERE id = $2
      `, [status, leadId]);
    } finally {
      client.release();
    }
  }

  /**
   * Update queue statistics
   */
  private async updateQueueStatistics(): Promise<void> {
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
    } finally {
      client.release();
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<any> {
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
    } finally {
      client.release();
    }
  }

  /**
   * Pause campaign calling
   */
  async pauseCampaign(campaignId: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(
        'UPDATE campaigns SET status = $1 WHERE id = $2',
        ['paused', campaignId]
      );
      
      console.log(`⏸️  Campaign ${campaignId} paused`);
    } finally {
      client.release();
    }
  }

  /**
   * Resume campaign calling
   */
  async resumeCampaign(campaignId: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(
        'UPDATE campaigns SET status = $1 WHERE id = $2',
        ['active', campaignId]
      );
      
      console.log(`▶️  Campaign ${campaignId} resumed`);
    } finally {
      client.release();
    }
  }

  /**
   * Utility function to add delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get active calls count
   */
  async getActiveCalls(): Promise<number> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT COUNT(*) as active_calls
        FROM vapi_call_attempts
        WHERE status IN ('initiated', 'ringing', 'connected')
      `);
      
      return parseInt(result.rows[0].active_calls);
    } finally {
      client.release();
    }
  }

  /**
   * Process callback requests
   */
  async processCallbacks(): Promise<void> {
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
        // Update status to contacted and clear callback time
        await client.query(`
          UPDATE crm_leads 
          SET status = 'contacted', next_call_scheduled_at = NULL
          WHERE id = $1
        `, [lead.id]);
        
        console.log(`🔄 Processed callback for lead ${lead.id}`);
      }
    } finally {
      client.release();
    }
  }
}