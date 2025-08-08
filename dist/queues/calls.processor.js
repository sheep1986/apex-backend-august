"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallsProcessor = void 0;
const bullmq_1 = require("bullmq");
class CallsProcessor {
    constructor(pool, redisConnection, vapiService, complianceService, callAnalysisService) {
        this.pool = pool;
        this.callsQueue = new bullmq_1.Queue('calls', { connection: redisConnection });
        this.vapiService = vapiService;
        this.complianceService = complianceService;
        this.callAnalysisService = callAnalysisService;
        this.worker = new bullmq_1.Worker('calls', this.processJob.bind(this), {
            connection: redisConnection,
            concurrency: 3,
            removeOnComplete: 200,
            removeOnFail: 100,
        });
        this.setupEventListeners();
    }
    setupEventListeners() {
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
    async processJob(job) {
        const { name, data } = job;
        try {
            switch (name) {
                case 'make-call':
                    return await this.processMakeCall(job, data);
                case 'analyze-call':
                    return await this.processAnalyzeCall(job, data);
                case 'retry-call':
                    return await this.processRetryCall(job, data);
                case 'update-call-status':
                    return await this.processUpdateCallStatus(job, data);
                case 'process-callback':
                    return await this.processCallback(job, data);
                case 'cleanup-stale-calls':
                    return await this.processCleanupStaleCalls(job, data);
                default:
                    throw new Error(`Unknown job type: ${name}`);
            }
        }
        catch (error) {
            console.error(`Call job ${job.id} error:`, error);
            throw error;
        }
    }
    async processMakeCall(job, data) {
        const { leadId, campaignId, phoneNumberId, assistantId, attemptNumber } = data;
        try {
            await job.updateProgress(10);
            console.log(`📞 Making call to lead ${leadId} (attempt ${attemptNumber})`);
            const leadInfo = await this.getLeadInfo(leadId);
            if (!leadInfo) {
                throw new Error(`Lead ${leadId} not found`);
            }
            await job.updateProgress(20);
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
            await this.updateCallAttempt(leadId, {
                vapi_call_id: callResult.id,
                status: 'initiated',
                started_at: new Date()
            });
            await job.updateProgress(80);
            await this.updateLeadStatus(leadId, 'calling');
            await this.updatePhoneNumberUsage(phoneNumberId);
            await job.updateProgress(100);
            return {
                callId: callResult.id,
                leadId,
                campaignId,
                status: 'initiated'
            };
        }
        catch (error) {
            console.error(`Make call error for lead ${leadId}:`, error);
            await this.updateCallAttempt(leadId, {
                status: 'failed',
                ended_at: new Date(),
                error: error.message
            });
            if (attemptNumber < 3 && this.shouldRetryCall(error)) {
                await this.scheduleRetry(leadId, campaignId, error.message);
            }
            throw error;
        }
    }
    async processAnalyzeCall(job, data) {
        const { callId, transcript, duration, recordingUrl, leadId, campaignId } = data;
        try {
            await job.updateProgress(10);
            console.log(`🤖 Analyzing call ${callId}`);
            const analysisResult = await this.callAnalysisService.analyzeCall({
                callId,
                transcript,
                duration,
                recordingUrl,
                leadId,
                campaignId
            });
            await job.updateProgress(60);
            await this.updateCallAttempt(leadId, {
                analyzed_at: new Date(),
                qualification_score: analysisResult.qualification_score
            });
            await job.updateProgress(80);
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
        }
        catch (error) {
            console.error(`Call analysis error for call ${callId}:`, error);
            throw error;
        }
    }
    async processRetryCall(job, data) {
        const { callId, leadId, campaignId, retryReason, retryAfter } = data;
        try {
            await job.updateProgress(20);
            console.log(`🔄 Retrying call for lead ${leadId}: ${retryReason}`);
            if (retryAfter && new Date() < retryAfter) {
                throw new Error('Retry time has not passed yet');
            }
            await job.updateProgress(40);
            const leadInfo = await this.getLeadInfo(leadId);
            const campaignInfo = await this.getCampaignInfo(campaignId);
            if (!leadInfo || !campaignInfo) {
                throw new Error('Lead or campaign not found');
            }
            await job.updateProgress(60);
            await this.queueMakeCall({
                leadId,
                campaignId,
                phoneNumberId: campaignInfo.phone_number_id,
                assistantId: campaignInfo.vapi_assistant_id,
                attemptNumber: await this.getNextAttemptNumber(leadId),
                priority: 5
            });
            await job.updateProgress(100);
            return {
                leadId,
                campaignId,
                retryReason,
                newAttemptQueued: true
            };
        }
        catch (error) {
            console.error(`Retry call error for lead ${leadId}:`, error);
            throw error;
        }
    }
    async processUpdateCallStatus(job, data) {
        const { callId, status, duration, cost, endedAt } = data;
        try {
            await job.updateProgress(20);
            console.log(`📊 Updating call ${callId} status to ${status}`);
            await this.updateCallAttemptByVapiId(callId, {
                status,
                duration_seconds: duration,
                cost,
                ended_at: endedAt || new Date()
            });
            await job.updateProgress(60);
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
        }
        catch (error) {
            console.error(`Update call status error for call ${callId}:`, error);
            throw error;
        }
    }
    async processCallback(job, data) {
        const { leadId, callbackTime, reason } = data;
        try {
            await job.updateProgress(20);
            console.log(`📅 Processing callback for lead ${leadId}`);
            await this.updateLeadStatus(leadId, 'callback');
            await job.updateProgress(60);
            await this.scheduleCallback(leadId, callbackTime, reason);
            await job.updateProgress(100);
            return {
                leadId,
                callbackTime,
                reason,
                scheduled: true
            };
        }
        catch (error) {
            console.error(`Callback processing error for lead ${leadId}:`, error);
            throw error;
        }
    }
    async processCleanupStaleCalls(job, data) {
        const { olderThanHours = 2 } = data;
        try {
            await job.updateProgress(20);
            console.log(`🧹 Cleaning up stale calls older than ${olderThanHours} hours`);
            const client = await this.pool.connect();
            try {
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
                        const callStatus = await this.vapiService.getCall(staleCall.vapi_call_id);
                        await this.updateCallAttemptByVapiId(staleCall.vapi_call_id, {
                            status: this.mapVapiStatus(callStatus.status),
                            ended_at: callStatus.endedAt ? new Date(callStatus.endedAt) : new Date()
                        });
                        cleanedCount++;
                    }
                    catch (error) {
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
            }
            finally {
                client.release();
            }
        }
        catch (error) {
            console.error('Cleanup stale calls error:', error);
            throw error;
        }
    }
    async queueMakeCall(data) {
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
    async queueAnalyzeCall(data) {
        return await this.callsQueue.add('analyze-call', data, {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 5000,
            },
        });
    }
    async queueRetryCall(data) {
        const delay = data.retryAfter.getTime() - Date.now();
        return await this.callsQueue.add('retry-call', data, {
            delay: Math.max(0, delay),
            attempts: 1,
        });
    }
    async queueUpdateCallStatus(callId, status, data = {}) {
        return await this.callsQueue.add('update-call-status', {
            callId,
            status,
            ...data
        }, {
            attempts: 2,
            delay: 1000,
        });
    }
    async queueCallback(leadId, callbackTime, reason) {
        return await this.callsQueue.add('process-callback', {
            leadId,
            callbackTime,
            reason
        }, {
            attempts: 1,
            delay: 2000,
        });
    }
    async queueCleanupStaleCalls() {
        return await this.callsQueue.add('cleanup-stale-calls', {
            olderThanHours: 2
        }, {
            attempts: 1,
            delay: 5000,
        });
    }
    async getLeadInfo(leadId) {
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
        }
        finally {
            client.release();
        }
    }
    async getCampaignInfo(campaignId) {
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
        }
        finally {
            client.release();
        }
    }
    async updateCallAttempt(leadId, updates) {
        const client = await this.pool.connect();
        try {
            const setClause = Object.keys(updates).map((key, index) => `${key} = $${index + 2}`).join(', ');
            if (setClause) {
                await client.query(`
          UPDATE vapi_call_attempts 
          SET ${setClause}
          WHERE lead_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `, [leadId, ...Object.values(updates)]);
            }
        }
        finally {
            client.release();
        }
    }
    async updateCallAttemptByVapiId(vapiCallId, updates) {
        const client = await this.pool.connect();
        try {
            const setClause = Object.keys(updates).map((key, index) => `${key} = $${index + 2}`).join(', ');
            if (setClause) {
                await client.query(`
          UPDATE vapi_call_attempts 
          SET ${setClause}
          WHERE vapi_call_id = $1
        `, [vapiCallId, ...Object.values(updates)]);
            }
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
        SET status = $1, updated_at = NOW()
        WHERE id = $2
      `, [status, leadId]);
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
        WHERE vapi_phone_number_id = $1
      `, [phoneNumberId]);
        }
        finally {
            client.release();
        }
    }
    async getNextAttemptNumber(leadId) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
        SELECT COALESCE(MAX(attempt_number), 0) + 1 as next_attempt
        FROM vapi_call_attempts
        WHERE lead_id = $1
      `, [leadId]);
            return result.rows[0].next_attempt;
        }
        finally {
            client.release();
        }
    }
    async getLeadIdFromCallId(vapiCallId) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
        SELECT lead_id FROM vapi_call_attempts
        WHERE vapi_call_id = $1
      `, [vapiCallId]);
            return result.rows[0]?.lead_id || null;
        }
        finally {
            client.release();
        }
    }
    async scheduleRetry(leadId, campaignId, reason) {
        const retryAfter = new Date(Date.now() + 60 * 60 * 1000);
        await this.queueRetryCall({
            callId: `retry_${leadId}_${Date.now()}`,
            leadId,
            campaignId,
            retryReason: reason,
            retryAfter
        });
    }
    async scheduleCallback(leadId, callbackTime, reason) {
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
        }
        finally {
            client.release();
        }
    }
    shouldRetryCall(error) {
        const retryableErrors = [
            'timeout',
            'network',
            'busy',
            'temporary',
            'rate_limit'
        ];
        return retryableErrors.some(keyword => error.message.toLowerCase().includes(keyword));
    }
    mapVapiStatus(vapiStatus) {
        const statusMap = {
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
    determineLeadStatus(callStatus) {
        const statusMap = {
            'completed': 'contacted',
            'failed': 'contacted',
            'busy': 'contacted',
            'no_answer': 'contacted',
            'voicemail': 'contacted'
        };
        return statusMap[callStatus] || 'contacted';
    }
    async getQueueStats() {
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
    async cleanupOldJobs() {
        try {
            await this.callsQueue.clean(24 * 60 * 60 * 1000, 200);
            console.log('✅ Call queue cleanup completed');
        }
        catch (error) {
            console.error('Call queue cleanup error:', error);
        }
    }
    async close() {
        await this.worker.close();
        await this.callsQueue.close();
    }
}
exports.CallsProcessor = CallsProcessor;
