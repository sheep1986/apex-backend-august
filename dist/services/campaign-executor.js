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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.campaignExecutor = exports.CampaignExecutor = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const supabase_client_1 = __importDefault(require("./supabase-client"));
const vapi_service_1 = require("./vapi-service");
const date_fns_1 = require("date-fns");
const date_fns_tz_1 = require("date-fns-tz");
class CampaignExecutor {
    constructor() {
        this.isRunning = false;
        this.processingCampaigns = new Set();
        this.vapiServiceCache = new Map();
    }
    startScheduler() {
        console.log('🚀 Campaign Executor started');
        node_cron_1.default.schedule('* * * * *', async () => {
            if (!this.isRunning) {
                this.isRunning = true;
                try {
                    await this.processCampaigns();
                }
                catch (error) {
                    console.error('❌ Error processing campaigns:', error);
                }
                finally {
                    this.isRunning = false;
                }
            }
        });
        setTimeout(() => this.processCampaigns(), 5000);
    }
    async getVapiServiceForOrganization(organizationId) {
        if (this.vapiServiceCache.has(organizationId)) {
            return this.vapiServiceCache.get(organizationId) || null;
        }
        const vapiService = await vapi_service_1.VapiService.forOrganization(organizationId);
        this.vapiServiceCache.set(organizationId, vapiService);
        return vapiService;
    }
    clearVapiServiceCache(organizationId) {
        if (organizationId) {
            this.vapiServiceCache.delete(organizationId);
        }
        else {
            this.vapiServiceCache.clear();
        }
    }
    async processCampaigns() {
        try {
            const { data: campaigns, error } = await supabase_client_1.default
                .from('campaigns')
                .select('*, organization_id')
                .in('status', ['active', 'scheduled'])
                .order('created_at', { ascending: true });
            if (error) {
                console.error('❌ Error fetching campaigns:', error);
                return;
            }
            if (!campaigns || campaigns.length === 0) {
                return;
            }
            console.log(`📋 Processing ${campaigns.length} campaigns...`);
            for (const campaign of campaigns) {
                if (this.processingCampaigns.has(campaign.id)) {
                    continue;
                }
                try {
                    this.processingCampaigns.add(campaign.id);
                    await this.processCampaign(campaign);
                }
                catch (error) {
                    console.error(`❌ Error processing campaign ${campaign.id}:`, error);
                }
                finally {
                    this.processingCampaigns.delete(campaign.id);
                }
            }
        }
        catch (error) {
            console.error('❌ Error in processCampaigns:', error);
        }
    }
    async processCampaign(campaign) {
        const now = new Date();
        if (campaign.status === 'scheduled') {
            if (!campaign.scheduledStart || new Date(campaign.scheduledStart) > now) {
                return;
            }
            await this.startCampaign(campaign.id);
            campaign.status = 'active';
        }
        if (!this.isWithinWorkingHours(campaign, now)) {
            return;
        }
        const todayCallCount = await this.getTodayCallCount(campaign.id);
        if (campaign.callLimitSettings.enableDailyLimit &&
            todayCallCount >= campaign.callLimitSettings.dailyCallLimit) {
            console.log(`📞 Campaign ${campaign.id} reached daily limit (${todayCallCount}/${campaign.callLimitSettings.dailyCallLimit})`);
            return;
        }
        const callsToMake = await this.getCallsToMake(campaign.id, campaign.callLimitSettings.dailyCallLimit - todayCallCount);
        if (callsToMake.length === 0) {
            const pendingCalls = await this.getPendingCallsCount(campaign.id);
            if (pendingCalls === 0) {
                await this.completeCampaign(campaign.id);
            }
            return;
        }
        console.log(`📞 Campaign ${campaign.id}: Making ${callsToMake.length} calls`);
        for (const queuedCall of callsToMake) {
            try {
                await this.makeCall(campaign, queuedCall);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            catch (error) {
                console.error(`❌ Error making call ${queuedCall.id}:`, error);
                await this.markCallFailed(queuedCall.id, 'system_error');
            }
        }
    }
    isWithinWorkingHours(campaign, now) {
        if (!campaign.workingHours) {
            console.warn(`Campaign ${campaign.id} missing workingHours - defaulting to business hours`);
            campaign.workingHours = {
                start: '09:00',
                end: '17:00',
                timezone: 'America/New_York'
            };
        }
        const timezone = campaign.workingHours.timezone || 'America/New_York';
        const zonedNow = (0, date_fns_tz_1.utcToZonedTime)(now, timezone);
        if (!campaign.workingDays) {
            console.warn(`Campaign ${campaign.id} missing workingDays - defaulting to weekdays`);
            campaign.workingDays = {
                monday: true,
                tuesday: true,
                wednesday: true,
                thursday: true,
                friday: true,
                saturday: false,
                sunday: false
            };
        }
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const currentDay = dayNames[zonedNow.getDay()];
        if (!campaign.workingDays[currentDay]) {
            return false;
        }
        const currentTime = (0, date_fns_1.format)(zonedNow, 'HH:mm');
        const startTime = campaign.workingHours.start;
        const endTime = campaign.workingHours.end;
        return currentTime >= startTime && currentTime <= endTime;
    }
    async getTodayCallCount(campaignId) {
        const today = (0, date_fns_1.format)(new Date(), 'yyyy-MM-dd');
        const { count, error } = await supabase_client_1.default
            .from('calls')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaignId)
            .gte('call_started_at', `${today}T00:00:00`)
            .lt('call_started_at', `${today}T23:59:59`);
        if (error) {
            console.error('❌ Error getting today call count:', error);
            return 0;
        }
        return count || 0;
    }
    async getCallsToMake(campaignId, limit) {
        const now = new Date().toISOString();
        const { data: calls, error } = await supabase_client_1.default
            .from('call_queue')
            .select('*')
            .eq('campaign_id', campaignId)
            .eq('status', 'pending')
            .lte('scheduled_for', now)
            .order('scheduled_for', { ascending: true })
            .limit(limit);
        if (error) {
            console.error('❌ Error getting calls to make:', error);
            return [];
        }
        return calls || [];
    }
    async getPendingCallsCount(campaignId) {
        const { count, error } = await supabase_client_1.default
            .from('call_queue')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaignId)
            .eq('status', 'pending');
        if (error) {
            console.error('❌ Error getting pending calls count:', error);
            return 0;
        }
        return count || 0;
    }
    async makeCall(campaign, queuedCall) {
        try {
            await supabase_client_1.default
                .from('call_queue')
                .update({
                status: 'calling',
                updated_at: new Date().toISOString()
            })
                .eq('id', queuedCall.id);
            const vapiService = await this.getVapiServiceForOrganization(campaign.organization_id);
            if (!vapiService) {
                throw new Error(`No VAPI credentials configured for organization: ${campaign.organization_id}`);
            }
            const phoneNumberId = this.selectPhoneNumber(campaign.phoneNumberIds, queuedCall.attempt);
            const call = await vapiService.createCall({
                assistantId: campaign.assistantId,
                phoneNumberId: phoneNumberId,
                customer: {
                    number: queuedCall.phoneNumber,
                    name: queuedCall.contactName
                }
            });
            await supabase_client_1.default
                .from('call_queue')
                .update({
                last_call_id: call.id,
                last_attempt_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
                .eq('id', queuedCall.id);
            console.log(`📞 Call initiated: ${queuedCall.contactName} (${queuedCall.phoneNumber}) - VAPI Call ID: ${call.id}`);
        }
        catch (error) {
            console.error(`❌ Error making call for ${queuedCall.contactName}:`, error);
            await this.markCallFailed(queuedCall.id, 'vapi_error');
        }
    }
    selectPhoneNumber(phoneNumberIds, attempt) {
        const index = attempt % phoneNumberIds.length;
        return phoneNumberIds[index];
    }
    async markCallFailed(queuedCallId, reason) {
        await supabase_client_1.default
            .from('call_queue')
            .update({
            status: 'failed',
            last_outcome: reason,
            updated_at: new Date().toISOString()
        })
            .eq('id', queuedCallId);
    }
    async startCampaign(campaignId) {
        console.log(`🚀 Starting campaign ${campaignId}`);
        const { data: contacts, error } = await supabase_client_1.default
            .from('campaign_contacts')
            .select('*')
            .eq('campaign_id', campaignId);
        if (error) {
            console.error('❌ Error getting campaign contacts:', error);
            return;
        }
        if (!contacts || contacts.length === 0) {
            console.log(`⚠️ No contacts found for campaign ${campaignId}`);
            return;
        }
        const queueEntries = contacts.map(contact => ({
            campaign_id: campaignId,
            contact_id: contact.id,
            phone_number: contact.phone,
            contact_name: contact.name || `${contact.first_name} ${contact.last_name}`,
            attempt: 1,
            scheduled_for: new Date().toISOString(),
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }));
        const { error: insertError } = await supabase_client_1.default
            .from('call_queue')
            .insert(queueEntries);
        if (insertError) {
            console.error('❌ Error creating call queue:', insertError);
            return;
        }
        await supabase_client_1.default
            .from('campaigns')
            .update({
            status: 'active',
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
            .eq('id', campaignId);
        console.log(`✅ Campaign ${campaignId} started with ${contacts.length} contacts`);
    }
    async completeCampaign(campaignId) {
        console.log(`🎯 Completing campaign ${campaignId}`);
        await supabase_client_1.default
            .from('campaigns')
            .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
            .eq('id', campaignId);
    }
    async processCallResult(vapiCallId, result) {
        try {
            const { data: queuedCall, error } = await supabase_client_1.default
                .from('call_queue')
                .select('*')
                .eq('last_call_id', vapiCallId)
                .single();
            if (error || !queuedCall) {
                console.error('❌ Could not find queued call for VAPI call:', vapiCallId);
                return;
            }
            const outcome = this.determineCallOutcome(result);
            await supabase_client_1.default
                .from('call_queue')
                .update({
                status: 'completed',
                last_outcome: outcome,
                updated_at: new Date().toISOString()
            })
                .eq('id', queuedCall.id);
            await this.saveCallRecord(queuedCall, result, outcome);
            await this.scheduleRetryIfNeeded(queuedCall, outcome);
            console.log(`✅ Processed call result: ${queuedCall.contact_name} - ${outcome}`);
        }
        catch (error) {
            console.error('❌ Error processing call result:', error);
        }
    }
    determineCallOutcome(result) {
        if (result.endedReason === 'customer-ended-call')
            return 'answered';
        if (result.endedReason === 'assistant-ended-call')
            return 'completed';
        if (result.endedReason === 'pipeline-error-openai-voice-failed')
            return 'failed';
        if (result.type === 'call-ended' && result.call?.duration > 30)
            return 'answered';
        if (result.type === 'call-ended' && result.call?.duration <= 30)
            return 'no_answer';
        return 'unknown';
    }
    async saveCallRecord(queuedCall, vapiResult, outcome) {
        const { data: campaign } = await supabase_client_1.default
            .from('campaigns')
            .select('organization_id')
            .eq('id', queuedCall.campaignId)
            .single();
        const phoneFromWebhook = vapiResult.customerPhone || vapiResult.call?.customer?.number;
        const phoneFromQueue = queuedCall.phoneNumber;
        const finalPhone = phoneFromWebhook || phoneFromQueue;
        const nameFromWebhook = vapiResult.customerName || vapiResult.call?.customer?.name;
        const nameFromQueue = queuedCall.contactName;
        const finalName = nameFromWebhook || nameFromQueue;
        if (!finalPhone) {
            console.error(`❌ CRITICAL: No phone number found for call ${vapiResult.call?.id}`);
            console.log('   Webhook phone:', phoneFromWebhook);
            console.log('   Queue phone:', phoneFromQueue);
            console.log('   VAPI result:', JSON.stringify(vapiResult, null, 2));
        }
        else {
            console.log(`✅ Phone number found: ${finalPhone} (from ${phoneFromWebhook ? 'webhook' : 'queue'})`);
        }
        const callRecord = {
            id: vapiResult.call?.id || queuedCall.last_call_id,
            campaign_id: queuedCall.campaignId,
            customer_name: finalName,
            customer_phone: finalPhone,
            outcome: outcome,
            duration_seconds: vapiResult.call?.duration || vapiResult.duration || 0,
            cost: vapiResult.call?.cost || vapiResult.cost || 0,
            call_started_at: vapiResult.call?.startedAt || queuedCall.last_attempt_at,
            call_ended_at: vapiResult.call?.endedAt || new Date().toISOString(),
            transcript: vapiResult.transcript || vapiResult.call?.transcript || null,
            recording_url: vapiResult.recordingUrl || vapiResult.call?.recordingUrl || vapiResult.call?.stereoRecordingUrl || null,
            vapi_call_id: vapiResult.call?.id,
            organization_id: campaign?.organization_id,
            contact_info: {
                phone: finalPhone,
                name: finalName,
                source: phoneFromWebhook ? 'vapi_webhook' : 'call_queue'
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        const { data: savedCall, error } = await supabase_client_1.default
            .from('calls')
            .upsert(callRecord, { onConflict: 'id' })
            .select()
            .single();
        if (error) {
            console.error('❌ Error saving call record:', error);
            return;
        }
        const transcript = vapiResult.transcript || vapiResult.call?.transcript;
        if (outcome !== 'no_answer' && outcome !== 'failed' && transcript) {
            console.log('🤖 Triggering AI processing for call:', savedCall.id);
            try {
                const { processCallWithAI } = await Promise.resolve().then(() => __importStar(require('./ai-call-processor')));
                const vapiCallData = {
                    ...vapiResult.call,
                    transcript: transcript,
                    summary: vapiResult.summary || vapiResult.call?.summary,
                    analysis: vapiResult.analysis || vapiResult.call?.analysis
                };
                await processCallWithAI(savedCall.id, vapiCallData);
            }
            catch (aiError) {
                console.error('❌ AI processing failed:', aiError);
            }
        }
    }
    async scheduleRetryIfNeeded(queuedCall, outcome) {
        const { data: campaign, error } = await supabase_client_1.default
            .from('campaigns')
            .select('retry_settings')
            .eq('id', queuedCall.campaignId)
            .single();
        if (error || !campaign)
            return;
        const retrySettings = campaign.retry_settings;
        if (!retrySettings?.enableRetries)
            return;
        if (queuedCall.attempt >= retrySettings.maxRetries)
            return;
        const shouldRetry = ((outcome === 'no_answer' && retrySettings.retryOnNoAnswer) ||
            (outcome === 'busy' && retrySettings.retryOnBusy) ||
            (outcome === 'voicemail' && retrySettings.retryOnVoicemail) ||
            (outcome === 'failed' && retrySettings.retryOnFailed) ||
            (outcome === 'quick_hangup' && (retrySettings.retryOnQuickHangup ?? true)) ||
            (outcome === 'provider_error' && (retrySettings.retryOnFailed ?? true)) ||
            (outcome === 'system_error' && (retrySettings.retryOnFailed ?? true)));
        if (!shouldRetry)
            return;
        const delay = retrySettings.retryDelay;
        const unit = retrySettings.retryDelayUnit;
        const nextRetry = unit === 'hours'
            ? (0, date_fns_1.addHours)(new Date(), delay)
            : (0, date_fns_1.addDays)(new Date(), delay);
        const retryEntry = {
            campaign_id: queuedCall.campaignId,
            contact_id: queuedCall.contactId,
            phone_number: queuedCall.phoneNumber,
            contact_name: queuedCall.contactName,
            attempt: queuedCall.attempt + 1,
            scheduled_for: nextRetry.toISOString(),
            status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        await supabase_client_1.default
            .from('call_queue')
            .insert(retryEntry);
        console.log(`🔄 Scheduled retry for ${queuedCall.contactName} at ${(0, date_fns_1.format)(nextRetry, 'PPpp')}`);
    }
    async pauseCampaign(campaignId) {
        await supabase_client_1.default
            .from('campaigns')
            .update({
            status: 'paused',
            updated_at: new Date().toISOString()
        })
            .eq('id', campaignId);
        console.log(`⏸️ Campaign ${campaignId} paused`);
    }
    async resumeCampaign(campaignId) {
        await supabase_client_1.default
            .from('campaigns')
            .update({
            status: 'active',
            updated_at: new Date().toISOString()
        })
            .eq('id', campaignId);
        console.log(`▶️ Campaign ${campaignId} resumed`);
    }
    async getCampaignStatus(campaignId) {
        const [campaignResult, queueResult, callsResult] = await Promise.all([
            supabase_client_1.default.from('campaigns').select('*').eq('id', campaignId).single(),
            supabase_client_1.default.from('call_queue').select('*').eq('campaign_id', campaignId),
            supabase_client_1.default.from('calls').select('*').eq('campaign_id', campaignId)
        ]);
        const campaign = campaignResult.data;
        const queue = queueResult.data || [];
        const calls = callsResult.data || [];
        return {
            campaign,
            metrics: {
                totalContacts: queue.length,
                callsCompleted: calls.length,
                callsPending: queue.filter(q => q.status === 'pending').length,
                callsInProgress: queue.filter(q => q.status === 'calling').length,
                successRate: calls.length > 0 ? (calls.filter(c => c.outcome === 'answered').length / calls.length) * 100 : 0,
                totalCost: calls.reduce((sum, call) => sum + (call.cost || 0), 0),
                avgDuration: calls.length > 0 ? calls.reduce((sum, call) => sum + (call.duration_seconds || 0), 0) / calls.length : 0
            },
            queue,
            calls
        };
    }
}
exports.CampaignExecutor = CampaignExecutor;
exports.campaignExecutor = new CampaignExecutor();
