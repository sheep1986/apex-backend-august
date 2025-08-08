import { Pool } from 'pg';
import { Job, Worker, Queue } from 'bullmq';
import { VapiIntegrationService } from '../services/vapi-integration.service';
import { ComplianceService } from '../services/compliance.service';
import { CallAnalysisService } from '../services/call-analysis.service';

interface CallJob {
  leadId: string;
  campaignId: string;
  phoneNumberId: string;
  assistantId: string;
  attemptNumber: number;
  scheduledFor?: Date;
  priority?: number;
}

interface CallAnalysisJob {
  callId: string;
  transcript: string;
  duration: number;
  recordingUrl?: string;
  leadId: string;
  campaignId: string;
}

interface CallRetryJob {
  callId: string;
  leadId: string;
  campaignId: string;
  retryReason: string;
  retryAfter: Date;
}

export class CallsProcessor {
  private pool: Pool;
  private callsQueue: Queue;
  private vapiService: VapiIntegrationService;
  private complianceService: ComplianceService;
  private callAnalysisService: CallAnalysisService;
  private worker: Worker;

  constructor(
    pool: Pool, 
    redisConnection: any,
    vapiService: VapiIntegrationService,
    complianceService: ComplianceService,
    callAnalysisService: CallAnalysisService
  ) {
    this.pool = pool;
    this.callsQueue = new Queue('calls', { connection: redisConnection });
    this.vapiService = vapiService;
    this.complianceService = complianceService;
    this.callAnalysisService = callAnalysisService;
    
    // Create worker
    this.worker = new Worker('calls', this.processJob.bind(this), {
      connection: redisConnection,
      concurrency: 3, // Limit concurrent calls
      removeOnComplete: 200, // Keep last 200 completed jobs
      removeOnFail: 100, // Keep last 100 failed jobs
    });

    this.setupEventListeners();
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.worker.on('completed', (job) => {
      console.log(`✅ Call job ${job.id} completed`);
    });

    this.worker.on('failed', (job, error) => {
      console.error(`❌ Call job ${job?.id} failed:`, error);
    });

    this.worker.on('progress', (job, progress) => {
      console.log(`📊 Call job ${job.id} progress: ${progress}%`);
    });

    this.worker.on('error', (error) => {
      console.error('Call worker error:', error);
    });
  }

  /**
   * Process job based on type
   */
  private async processJob(job: Job): Promise<any> {
    const { name, data } = job;
    
    try {
      switch (name) {
        case 'make-call':
          return await this.processMakeCall(job, data as CallJob);
        case 'analyze-call':
          return await this.processAnalyzeCall(job, data as CallAnalysisJob);
        case 'retry-call':
          return await this.processRetryCall(job, data as CallRetryJob);
        case 'update-call-status':
          return await this.processUpdateCallStatus(job, data);
        case 'process-callback':
          return await this.processCallback(job, data);
        case 'cleanup-stale-calls':
          return await this.processCleanupStaleCalls(job, data);
        default:
          throw new Error(`Unknown job type: ${name}`);
      }
    } catch (error) {
      console.error(`Call job ${job.id} error:`, error);
      throw error;
    }
  }

  /**
   * Process make call job
   */
  private async processMakeCall(job: Job, data: CallJob): Promise<any> {
    const { leadId, campaignId, phoneNumberId, assistantId, attemptNumber } = data;
    
    try {
      await job.updateProgress(10);
      
      console.log(`📞 Making call to lead ${leadId} (attempt ${attemptNumber})`);
      
      // Get lead information
      const leadInfo = await this.getLeadInfo(leadId);
      if (!leadInfo) {
        throw new Error(`Lead ${leadId} not found`);
      }

      await job.updateProgress(20);
      
      // Check compliance
      const complianceResult = await this.complianceService.checkCompliance({
        phone_number: leadInfo.phone_number,
        campaign_id: campaignId,
        account_id: leadInfo.account_id,
        timezone: leadInfo.timezone,
        lead_id: leadId
      });

      if (!complianceResult.allowed) {
        throw new Error(`Compliance check failed: ${complianceResult.reason}`);
      }

      await job.updateProgress(40);
      
      // Make the call via VAPI
      const callResult = await this.vapiService.makeCall({
        assistantId,
        phoneNumberId,
        customer: {
          number: leadInfo.phone_number,
          name: `${leadInfo.first_name} ${leadInfo.last_name}`.trim()
        },
        metadata: {
          leadId,
          campaignId,
          attemptNumber,
          jobId: job.id
        }
      });

      await job.updateProgress(60);
      
      // Update call attempt record
      await this.updateCallAttempt(leadId, {
        vapi_call_id: callResult.id,
        status: 'initiated',
        started_at: new Date()
      });

      await job.updateProgress(80);
      
      // Update lead status
      await this.updateLeadStatus(leadId, 'calling');
      
      // Update phone number usage
      await this.updatePhoneNumberUsage(phoneNumberId);

      await job.updateProgress(100);
      
      return {
        callId: callResult.id,
        leadId,
        campaignId,
        status: 'initiated'
      };
      
    } catch (error) {
      console.error(`Make call error for lead ${leadId}:`, error);
      
      // Update call attempt with error
      await this.updateCallAttempt(leadId, {
        status: 'failed',
        ended_at: new Date(),
        error: error.message
      });
      
      // Schedule retry if appropriate
      if (attemptNumber < 3 && this.shouldRetryCall(error)) {
        await this.scheduleRetry(leadId, campaignId, error.message);
      }
      
      throw error;
    }
  }

  /**
   * Process analyze call job
   */
  private async processAnalyzeCall(job: Job, data: CallAnalysisJob): Promise<any> {
    const { callId, transcript, duration, recordingUrl, leadId, campaignId } = data;
    
    try {
      await job.updateProgress(10);
      
      console.log(`🤖 Analyzing call ${callId}`);
      
      // Analyze the call
      const analysisResult = await this.callAnalysisService.analyzeCall({
        callId,
        transcript,
        duration,
        recordingUrl,
        leadId,
        campaignId
      });

      await job.updateProgress(60);
      
      // Update call attempt with analysis
      await this.updateCallAttempt(leadId, {
        analyzed_at: new Date(),
        qualification_score: analysisResult.qualification_score
      });

      await job.updateProgress(80);
      
      // If lead is qualified, update status
      if (analysisResult.qualification_score >= 70) {
        await this.updateLeadStatus(leadId, 'qualified');
      }

      await job.updateProgress(100);
      
      return {
        callId,
        leadId,
        qualification_score: analysisResult.qualification_score,
        recommended_action: analysisResult.recommended_action
      };
      
    } catch (error) {
      console.error(`Call analysis error for call ${callId}:`, error);
      throw error;
    }
  }

  /**
   * Process retry call job
   */
  private async processRetryCall(job: Job, data: CallRetryJob): Promise<any> {
    const { callId, leadId, campaignId, retryReason, retryAfter } = data;
    
    try {
      await job.updateProgress(20);
      
      console.log(`🔄 Retrying call for lead ${leadId}: ${retryReason}`);
      
      // Check if retry time has passed
      if (retryAfter && new Date() < retryAfter) {
        throw new Error('Retry time has not passed yet');
      }

      await job.updateProgress(40);
      
      // Get campaign and lead info
      const leadInfo = await this.getLeadInfo(leadId);
      const campaignInfo = await this.getCampaignInfo(campaignId);
      
      if (!leadInfo || !campaignInfo) {
        throw new Error('Lead or campaign not found');
      }

      await job.updateProgress(60);
      
      // Queue new call attempt
      await this.queueMakeCall({
        leadId,
        campaignId,
        phoneNumberId: campaignInfo.phone_number_id,
        assistantId: campaignInfo.vapi_assistant_id,
        attemptNumber: await this.getNextAttemptNumber(leadId),
        priority: 5 // Higher priority for retries
      });

      await job.updateProgress(100);
      
      return {
        leadId,
        campaignId,
        retryReason,
        newAttemptQueued: true
      };
      
    } catch (error) {
      console.error(`Retry call error for lead ${leadId}:`, error);
      throw error;
    }
  }

  /**
   * Process update call status job
   */
  private async processUpdateCallStatus(job: Job, data: any): Promise<any> {
    const { callId, status, duration, cost, endedAt } = data;
    
    try {
      await job.updateProgress(20);
      
      console.log(`📊 Updating call ${callId} status to ${status}`);
      
      // Update call attempt
      await this.updateCallAttemptByVapiId(callId, {
        status,
        duration_seconds: duration,
        cost,
        ended_at: endedAt || new Date()
      });

      await job.updateProgress(60);
      
      // Update lead status based on call outcome
      const leadId = await this.getLeadIdFromCallId(callId);
      if (leadId) {
        const newLeadStatus = this.determineLeadStatus(status);
        await this.updateLeadStatus(leadId, newLeadStatus);
      }

      await job.updateProgress(100);
      
      return {
        callId,
        status,
        leadId,
        updated: true
      };
      
    } catch (error) {
      console.error(`Update call status error for call ${callId}:`, error);
      throw error;
    }
  }

  /**
   * Process callback job
   */
  private async processCallback(job: Job, data: any): Promise<any> {
    const { leadId, callbackTime, reason } = data;
    
    try {
      await job.updateProgress(20);
      
      console.log(`📅 Processing callback for lead ${leadId}`);
      
      // Update lead with callback information
      await this.updateLeadStatus(leadId, 'callback');
      
      await job.updateProgress(60);
      
      // Schedule callback call
      await this.scheduleCallback(leadId, callbackTime, reason);

      await job.updateProgress(100);
      
      return {
        leadId,
        callbackTime,
        reason,
        scheduled: true
      };
      
    } catch (error) {
      console.error(`Callback processing error for lead ${leadId}:`, error);
      throw error;
    }
  }

  /**
   * Process cleanup stale calls job
   */
  private async processCleanupStaleCalls(job: Job, data: any): Promise<any> {
    const { olderThanHours = 2 } = data;
    
    try {
      await job.updateProgress(20);
      
      console.log(`🧹 Cleaning up stale calls older than ${olderThanHours} hours`);
      
      const client = await this.pool.connect();
      
      try {
        // Find stale calls
        const staleCallsResult = await client.query(`
          SELECT vapi_call_id, lead_id
          FROM vapi_call_attempts
          WHERE status IN ('initiated', 'ringing', 'connected')
          AND created_at < NOW() - INTERVAL '${olderThanHours} hours'
        `);

        await job.updateProgress(50);
        
        let cleanedCount = 0;
        
        for (const staleCall of staleCallsResult.rows) {
          try {
            // Try to get current status from VAPI
            const callStatus = await this.vapiService.getCall(staleCall.vapi_call_id);
            
            // Update with current status
            await this.updateCallAttemptByVapiId(staleCall.vapi_call_id, {
              status: this.mapVapiStatus(callStatus.status),
              ended_at: callStatus.endedAt ? new Date(callStatus.endedAt) : new Date()
            });
            
            cleanedCount++;
            
          } catch (error) {
            // If we can't get status, mark as failed
            await this.updateCallAttemptByVapiId(staleCall.vapi_call_id, {
              status: 'failed',
              ended_at: new Date(),
              error: 'Call cleanup - status unavailable'
            });
            
            cleanedCount++;
          }
        }

        await job.updateProgress(100);
        
        return {
          staleCalls: staleCallsResult.rows.length,
          cleaned: cleanedCount
        };
        
      } finally {
        client.release();
      }
      
    } catch (error) {
      console.error('Cleanup stale calls error:', error);
      throw error;
    }
  }

  /**
   * Queue jobs
   */
  async queueMakeCall(data: CallJob): Promise<Job> {
    const delay = data.scheduledFor ? data.scheduledFor.getTime() - Date.now() : 0;
    
    return await this.callsQueue.add('make-call', data, {
      delay: Math.max(0, delay),
      priority: data.priority || 1,
      attempts: 2,
      backoff: {
        type: 'exponential',
        delay: 10000,
      },
    });
  }

  async queueAnalyzeCall(data: CallAnalysisJob): Promise<Job> {
    return await this.callsQueue.add('analyze-call', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });
  }

  async queueRetryCall(data: CallRetryJob): Promise<Job> {
    const delay = data.retryAfter.getTime() - Date.now();
    
    return await this.callsQueue.add('retry-call', data, {
      delay: Math.max(0, delay),
      attempts: 1,
    });
  }

  async queueUpdateCallStatus(callId: string, status: string, data: any = {}): Promise<Job> {
    return await this.callsQueue.add('update-call-status', {
      callId,
      status,
      ...data
    }, {
      attempts: 2,
      delay: 1000,
    });
  }

  async queueCallback(leadId: string, callbackTime: Date, reason: string): Promise<Job> {
    return await this.callsQueue.add('process-callback', {
      leadId,
      callbackTime,
      reason
    }, {
      attempts: 1,
      delay: 2000,
    });
  }

  async queueCleanupStaleCalls(): Promise<Job> {
    return await this.callsQueue.add('cleanup-stale-calls', {
      olderThanHours: 2
    }, {
      attempts: 1,
      delay: 5000,
    });
  }

  /**
   * Database operations
   */
  private async getLeadInfo(leadId: string): Promise<any> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          l.*, c.account_id
        FROM crm_leads l
        JOIN campaigns c ON c.id = l.campaign_id
        WHERE l.id = $1
      `, [leadId]);
      
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  private async getCampaignInfo(campaignId: string): Promise<any> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          c.*, cpn.vapi_phone_number_id as phone_number_id
        FROM campaigns c
        LEFT JOIN campaign_phone_numbers cpn ON cpn.campaign_id = c.id
        WHERE c.id = $1
        LIMIT 1
      `, [campaignId]);
      
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  private async updateCallAttempt(leadId: string, updates: any): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const setClause = Object.keys(updates).map((key, index) => 
        `${key} = $${index + 2}`
      ).join(', ');
      
      if (setClause) {
        await client.query(`
          UPDATE vapi_call_attempts 
          SET ${setClause}
          WHERE lead_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `, [leadId, ...Object.values(updates)]);
      }
    } finally {
      client.release();
    }
  }

  private async updateCallAttemptByVapiId(vapiCallId: string, updates: any): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const setClause = Object.keys(updates).map((key, index) => 
        `${key} = $${index + 2}`
      ).join(', ');
      
      if (setClause) {
        await client.query(`
          UPDATE vapi_call_attempts 
          SET ${setClause}
          WHERE vapi_call_id = $1
        `, [vapiCallId, ...Object.values(updates)]);
      }
    } finally {
      client.release();
    }
  }

  private async updateLeadStatus(leadId: string, status: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        UPDATE crm_leads 
        SET status = $1, updated_at = NOW()
        WHERE id = $2
      `, [status, leadId]);
    } finally {
      client.release();
    }
  }

  private async updatePhoneNumberUsage(phoneNumberId: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        UPDATE campaign_phone_numbers 
        SET 
          daily_call_count = daily_call_count + 1,
          total_call_count = total_call_count + 1,
          last_call_at = NOW()
        WHERE vapi_phone_number_id = $1
      `, [phoneNumberId]);
    } finally {
      client.release();
    }
  }

  private async getNextAttemptNumber(leadId: string): Promise<number> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT COALESCE(MAX(attempt_number), 0) + 1 as next_attempt
        FROM vapi_call_attempts
        WHERE lead_id = $1
      `, [leadId]);
      
      return result.rows[0].next_attempt;
    } finally {
      client.release();
    }
  }

  private async getLeadIdFromCallId(vapiCallId: string): Promise<string | null> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT lead_id FROM vapi_call_attempts
        WHERE vapi_call_id = $1
      `, [vapiCallId]);
      
      return result.rows[0]?.lead_id || null;
    } finally {
      client.release();
    }
  }

  private async scheduleRetry(leadId: string, campaignId: string, reason: string): Promise<void> {
    const retryAfter = new Date(Date.now() + 60 * 60 * 1000); // 1 hour later
    
    await this.queueRetryCall({
      callId: `retry_${leadId}_${Date.now()}`,
      leadId,
      campaignId,
      retryReason: reason,
      retryAfter
    });
  }

  private async scheduleCallback(leadId: string, callbackTime: Date, reason: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        UPDATE crm_leads 
        SET 
          next_call_scheduled_at = $1,
          status = 'callback',
          updated_at = NOW()
        WHERE id = $2
      `, [callbackTime, leadId]);
    } finally {
      client.release();
    }
  }

  /**
   * Utility methods
   */
  private shouldRetryCall(error: Error): boolean {
    const retryableErrors = [
      'timeout',
      'network',
      'busy',
      'temporary',
      'rate_limit'
    ];
    
    return retryableErrors.some(keyword => 
      error.message.toLowerCase().includes(keyword)
    );
  }

  private mapVapiStatus(vapiStatus: string): string {
    const statusMap: Record<string, string> = {
      'queued': 'initiated',
      'ringing': 'ringing',
      'in-progress': 'connected',
      'ended': 'completed',
      'failed': 'failed',
      'busy': 'busy',
      'no-answer': 'no_answer',
      'voicemail': 'voicemail'
    };
    
    return statusMap[vapiStatus] || 'failed';
  }

  private determineLeadStatus(callStatus: string): string {
    const statusMap: Record<string, string> = {
      'completed': 'contacted',
      'failed': 'contacted',
      'busy': 'contacted',
      'no_answer': 'contacted',
      'voicemail': 'contacted'
    };
    
    return statusMap[callStatus] || 'contacted';
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const waiting = await this.callsQueue.getWaiting();
    const active = await this.callsQueue.getActive();
    const completed = await this.callsQueue.getCompleted();
    const failed = await this.callsQueue.getFailed();
    const delayed = await this.callsQueue.getDelayed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  /**
   * Clean up old jobs
   */
  async cleanupOldJobs(): Promise<void> {
    try {
      await this.callsQueue.clean(24 * 60 * 60 * 1000, 200); // Clean jobs older than 24 hours
      console.log('✅ Call queue cleanup completed');
    } catch (error) {
      console.error('Call queue cleanup error:', error);
    }
  }

  /**
   * Close worker and queue
   */
  async close(): Promise<void> {
    await this.worker.close();
    await this.callsQueue.close();
  }
}