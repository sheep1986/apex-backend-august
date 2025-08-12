import cron from 'node-cron';
import supabase from './supabase-client';
import { VapiService } from './vapi-service';
import { addHours, addDays, format } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

interface CampaignSettings {
  id: string;
  organization_id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'scheduled';
  assistantId: string;
  phoneNumberIds: string[];
  workingHours: {
    start: string; // '09:00'
    end: string;   // '17:00'
    timezone: string; // 'America/New_York'
  };
  workingDays: {
    monday: boolean;
    tuesday: boolean;
    wednesday: boolean;
    thursday: boolean;
    friday: boolean;
    saturday: boolean;
    sunday: boolean;
  };
  callLimitSettings: {
    enableDailyLimit: boolean;
    dailyCallLimit: number;
  };
  retrySettings: {
    enableRetries: boolean;
    maxRetries: number;
    retryDelay: number;
    retryDelayUnit: 'hours' | 'days';
    retryOnNoAnswer: boolean;
    retryOnBusy: boolean;
    retryOnVoicemail: boolean;
    retryOnFailed: boolean;
  };
  createdAt: string;
  scheduledStart?: string;
}

interface QueuedCall {
  id: string;
  campaignId: string;
  contactId: string;
  phoneNumber: string;
  contactName: string;
  attempt: number;
  scheduledFor: string;
  status: 'pending' | 'calling' | 'completed' | 'failed' | 'retry_scheduled';
  lastCallId?: string;
  lastOutcome?: string;
  lastAttemptAt?: string;
  nextRetryAt?: string;
  createdAt: string;
  updatedAt: string;
}

export class CampaignExecutor {
  private isRunning = false;
  private processingCampaigns = new Set<string>();
  private vapiServiceCache = new Map<string, VapiService | null>();

  constructor() {
    // Don't auto-start in constructor to ensure proper initialization order
    console.log('📦 Campaign Executor instance created');
  }

  /**
   * Public method to start the campaign executor
   */
  public start() {
    console.log('🎯 Starting Campaign Executor...');
    this.startScheduler();
    this.startCleanupScheduler();
  }

  /**
   * Start cleanup scheduler for stuck calls
   */
  private startCleanupScheduler() {
    console.log('🧹 Starting stuck call cleanup scheduler...');
    
    // Run cleanup every 10 minutes
    setInterval(async () => {
      await this.cleanupStuckCalls();
    }, 10 * 60 * 1000);
    
    // Also run cleanup on startup after 30 seconds
    setTimeout(() => this.cleanupStuckCalls(), 30000);
  }

  /**
   * Clean up stuck calls that have been in progress too long
   */
  private async cleanupStuckCalls(): Promise<void> {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    const { data: stuckCalls, error } = await supabase
      .from('calls')
      .update({
        status: 'failed',
        end_reason: 'timeout',
        updated_at: new Date().toISOString()
      })
      .eq('status', 'in_progress')
      .lt('created_at', thirtyMinutesAgo)
      .select();
    
    if (error) {
      console.error('❌ Error cleaning up stuck calls:', error);
      return;
    }
    
    if (stuckCalls && stuckCalls.length > 0) {
      console.log(`🧹 Cleaned up ${stuckCalls.length} stuck calls`);
    }
  }

  /**
   * Initialize the campaign scheduler
   * Runs every minute to check for campaigns that need processing
   */
  private startScheduler() {
    console.log('🚀 Campaign Executor scheduler initializing...');
    
    // Run every minute
    const task = cron.schedule('* * * * *', async () => {
      console.log(`⏰ Campaign executor cron triggered at ${new Date().toISOString()}`);
      if (!this.isRunning) {
        this.isRunning = true;
        try {
          await this.processCampaigns();
        } catch (error) {
          console.error('❌ Error processing campaigns:', error);
        } finally {
          this.isRunning = false;
        }
      } else {
        console.log('⏭️ Skipping - campaign executor already running');
      }
    });

    console.log('✅ Campaign Executor cron job scheduled successfully');

    // Also run immediately on startup (after 5 seconds)
    setTimeout(() => {
      console.log('🏃 Running initial campaign check...');
      this.processCampaigns();
    }, 5000);
  }

  /**
   * Get VAPI service for a specific organization (with caching)
   */
  private async getVapiServiceForOrganization(organizationId: string): Promise<VapiService | null> {
    // Check cache first
    if (this.vapiServiceCache.has(organizationId)) {
      return this.vapiServiceCache.get(organizationId) || null;
    }

    // Create new service instance for organization
    const vapiService = await VapiService.forOrganization(organizationId);
    
    // Cache the result (including null for organizations without VAPI)
    this.vapiServiceCache.set(organizationId, vapiService);
    
    return vapiService;
  }

  /**
   * Clear VAPI service cache (useful when credentials are updated)
   */
  clearVapiServiceCache(organizationId?: string): void {
    if (organizationId) {
      this.vapiServiceCache.delete(organizationId);
    } else {
      this.vapiServiceCache.clear();
    }
  }

  /**
   * Main processing loop - checks all active campaigns
   */
  private async processCampaigns() {
    try {
      // Get all active campaigns with organization info
      const { data: campaigns, error } = await supabase
        .from('campaigns')
        .select('*, organization_id')
        .in('status', ['active', 'scheduled'])
        .order('created_at', { ascending: true });

      if (error) {
        console.error('❌ Error fetching campaigns:', error);
        return;
      }

      if (!campaigns || campaigns.length === 0) {
        return; // No campaigns to process
      }

      console.log(`📋 Processing ${campaigns.length} campaigns...`);

      for (const campaign of campaigns) {
        if (this.processingCampaigns.has(campaign.id)) {
          continue; // Already processing this campaign
        }

        try {
          this.processingCampaigns.add(campaign.id);
          await this.processCampaign(campaign);
        } catch (error) {
          console.error(`❌ Error processing campaign ${campaign.id}:`, error);
        } finally {
          this.processingCampaigns.delete(campaign.id);
        }
      }
    } catch (error) {
      console.error('❌ Error in processCampaigns:', error);
    }
  }

  /**
   * Process a single campaign
   */
  private async processCampaign(campaign: CampaignSettings) {
    const now = new Date();
    
    // Add lock check to prevent duplicate processing
    const lockKey = `campaign_lock_${campaign.id}`;
    const { data: existingLock } = await supabase
      .from('campaign_locks')
      .select('*')
      .eq('campaign_id', campaign.id)
      .gte('expires_at', now.toISOString())
      .single();
    
    if (existingLock) {
      console.log(`⏭️ Campaign ${campaign.id} is already being processed`);
      return;
    }
    
    // Create a lock for this campaign (expires in 2 minutes)
    const lockExpiry = new Date(now.getTime() + 2 * 60 * 1000);
    await supabase
      .from('campaign_locks')
      .upsert({
        campaign_id: campaign.id,
        locked_at: now.toISOString(),
        expires_at: lockExpiry.toISOString()
      });
    
    // Check if campaign should start (for scheduled campaigns)
    if (campaign.status === 'scheduled') {
      if (!campaign.scheduledStart || new Date(campaign.scheduledStart) > now) {
        return; // Not time to start yet
      }
      
      // Start the campaign
      await this.startCampaign(campaign.id);
      campaign.status = 'active';
    }

    // Check if we're in working hours
    if (!this.isWithinWorkingHours(campaign, now)) {
      return; // Outside working hours
    }

    // Check daily call limit
    const todayCallCount = await this.getTodayCallCount(campaign.id);
    if (campaign.callLimitSettings.enableDailyLimit && 
        todayCallCount >= campaign.callLimitSettings.dailyCallLimit) {
      console.log(`📞 Campaign ${campaign.id} reached daily limit (${todayCallCount}/${campaign.callLimitSettings.dailyCallLimit})`);
      return;
    }

    // Get calls that need to be made
    const callsToMake = await this.getCallsToMake(campaign.id, campaign.callLimitSettings.dailyCallLimit - todayCallCount);
    
    if (callsToMake.length === 0) {
      // Check if campaign is complete
      const pendingCalls = await this.getPendingCallsCount(campaign.id);
      if (pendingCalls === 0) {
        await this.completeCampaign(campaign.id);
      }
      return;
    }

    console.log(`📞 Campaign ${campaign.id}: Making ${callsToMake.length} calls`);

    // Make the calls
    for (const queuedCall of callsToMake) {
      try {
        // Check if call is already in progress for this lead
        if (await this.isCallInProgress(queuedCall.contactId || '', queuedCall.phoneNumber)) {
          console.log(`⏭️ Call already in progress for ${queuedCall.phoneNumber}`);
          continue;
        }
        
        await this.makeCall(campaign, queuedCall);
        // Add small delay between calls to avoid overwhelming VAPI
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`❌ Error making call ${queuedCall.id}:`, error);
        await this.markCallFailed(queuedCall.id, 'system_error');
      }
    }
  }

  /**
   * Check if current time is within campaign working hours
   */
  private isWithinWorkingHours(campaign: CampaignSettings, now: Date): boolean {
    // Handle missing working hours configuration
    if (!campaign.workingHours) {
      console.warn(`Campaign ${campaign.id} missing workingHours - defaulting to business hours`);
      campaign.workingHours = {
        start: '09:00',
        end: '17:00',
        timezone: 'America/New_York'
      };
    }
    
    const timezone = campaign.workingHours.timezone || 'America/New_York';
    const zonedNow = toZonedTime(now, timezone);
    
    // Handle missing working days configuration
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
    
    // Check day of week
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDay = dayNames[zonedNow.getDay()] as keyof typeof campaign.workingDays;
    
    if (!campaign.workingDays[currentDay]) {
      return false; // Not a working day
    }

    // Check time of day
    const currentTime = format(zonedNow, 'HH:mm');
    const startTime = campaign.workingHours.start;
    const endTime = campaign.workingHours.end;

    return currentTime >= startTime && currentTime <= endTime;
  }

  /**
   * Check if call is already in progress for a lead
   */
  private async isCallInProgress(leadId: string, phoneNumber: string): Promise<boolean> {
    const { data: existingCalls } = await supabase
      .from('calls')
      .select('id, status')
      .or(`lead_id.eq.${leadId},customer_phone.eq.${phoneNumber}`)
      .in('status', ['in_progress', 'queued', 'ringing'])
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()); // Last hour
    
    return !!(existingCalls && existingCalls.length > 0);
  }

  /**
   * Get count of calls made today for a campaign
   */
  private async getTodayCallCount(campaignId: string): Promise<number> {
    const today = format(new Date(), 'yyyy-MM-dd');
    
    const { count, error } = await supabase
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

  /**
   * Get calls that need to be made now
   */
  private async getCallsToMake(campaignId: string, limit: number): Promise<QueuedCall[]> {
    const now = new Date().toISOString();
    
    const { data: calls, error } = await supabase
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

  /**
   * Get count of pending calls for a campaign
   */
  private async getPendingCallsCount(campaignId: string): Promise<number> {
    const { count, error } = await supabase
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

  /**
   * Make a call using VAPI
   */
  private async makeCall(campaign: CampaignSettings, queuedCall: QueuedCall) {
    try {
      // Mark call as in progress
      await supabase
        .from('call_queue')
        .update({ 
          status: 'calling',
          updated_at: new Date().toISOString()
        })
        .eq('id', queuedCall.id);

      // Get organization-specific VAPI service
      const vapiService = await this.getVapiServiceForOrganization(campaign.organization_id);
      
      if (!vapiService) {
        throw new Error(`No VAPI credentials configured for organization: ${campaign.organization_id}`);
      }

      // Choose phone number (round robin)
      const phoneNumberId = this.selectPhoneNumber(campaign.phoneNumberIds, queuedCall.attempt);

      // Make the call via VAPI
      const call = await vapiService.createCall({
        assistantId: campaign.assistantId,
        phoneNumberId: phoneNumberId,
        customer: {
          number: queuedCall.phoneNumber,
          name: queuedCall.contactName
        }
      });

      // Update call queue with VAPI call ID
      await supabase
        .from('call_queue')
        .update({ 
          last_call_id: call.id,
          last_attempt_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', queuedCall.id);

      console.log(`📞 Call initiated: ${queuedCall.contactName} (${queuedCall.phoneNumber}) - VAPI Call ID: ${call.id}`);

    } catch (error) {
      console.error(`❌ Error making call for ${queuedCall.contactName}:`, error);
      await this.markCallFailed(queuedCall.id, 'vapi_error');
    }
  }

  /**
   * Select phone number for the call (round robin)
   */
  private selectPhoneNumber(phoneNumberIds: string[], attempt: number): string {
    const index = attempt % phoneNumberIds.length;
    return phoneNumberIds[index];
  }

  /**
   * Mark a call as failed and schedule retry if applicable
   */
  private async markCallFailed(queuedCallId: string, reason: string) {
    await supabase
      .from('call_queue')
      .update({ 
        status: 'failed',
        last_outcome: reason,
        updated_at: new Date().toISOString()
      })
      .eq('id', queuedCallId);
  }

  /**
   * Start a campaign by creating initial call queue
   */
  private async startCampaign(campaignId: string) {
    console.log(`🚀 Starting campaign ${campaignId}`);
    
    // Get campaign contacts
    const { data: contacts, error } = await supabase
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

    // Create call queue entries
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

    const { error: insertError } = await supabase
      .from('call_queue')
      .insert(queueEntries);

    if (insertError) {
      console.error('❌ Error creating call queue:', insertError);
      return;
    }

    // Update campaign status
    await supabase
      .from('campaigns')
      .update({ 
        status: 'active',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId);

    console.log(`✅ Campaign ${campaignId} started with ${contacts.length} contacts`);
  }

  /**
   * Complete a campaign when all calls are done
   */
  private async completeCampaign(campaignId: string) {
    console.log(`🎯 Completing campaign ${campaignId}`);
    
    await supabase
      .from('campaigns')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId);
  }

  /**
   * Process call result webhook from VAPI
   */
  async processCallResult(vapiCallId: string, result: any) {
    try {
      // Find the queued call
      const { data: queuedCall, error } = await supabase
        .from('call_queue')
        .select('*')
        .eq('last_call_id', vapiCallId)
        .single();

      if (error || !queuedCall) {
        console.error('❌ Could not find queued call for VAPI call:', vapiCallId);
        return;
      }

      const outcome = this.determineCallOutcome(result);
      
      // Update the call queue
      await supabase
        .from('call_queue')
        .update({
          status: 'completed',
          last_outcome: outcome,
          updated_at: new Date().toISOString()
        })
        .eq('id', queuedCall.id);

      // Save call record
      await this.saveCallRecord(queuedCall, result, outcome);

      // Check if we need to schedule a retry
      await this.scheduleRetryIfNeeded(queuedCall, outcome);

      console.log(`✅ Processed call result: ${queuedCall.contact_name} - ${outcome}`);

    } catch (error) {
      console.error('❌ Error processing call result:', error);
    }
  }

  /**
   * Determine call outcome from VAPI result
   */
  private determineCallOutcome(result: any): string {
    if (result.endedReason === 'customer-ended-call') return 'answered';
    if (result.endedReason === 'assistant-ended-call') return 'completed';
    if (result.endedReason === 'pipeline-error-openai-voice-failed') return 'failed';
    if (result.type === 'call-ended' && result.call?.duration > 30) return 'answered';
    if (result.type === 'call-ended' && result.call?.duration <= 30) return 'no_answer';
    return 'unknown';
  }

  /**
   * Save call record to database
   */
  private async saveCallRecord(queuedCall: QueuedCall, vapiResult: any, outcome: string) {
    // Get organization_id from campaign
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('organization_id')
      .eq('id', queuedCall.campaignId)
      .single();
    
    // ⭐ CRITICAL FIX: Use phone from webhook first, then fallback ⭐
    const phoneFromWebhook = vapiResult.customerPhone || vapiResult.call?.customer?.number;
    const phoneFromQueue = queuedCall.phoneNumber;
    const finalPhone = phoneFromWebhook || phoneFromQueue;
    
    const nameFromWebhook = vapiResult.customerName || vapiResult.call?.customer?.name;
    const nameFromQueue = queuedCall.contactName;
    const finalName = nameFromWebhook || nameFromQueue;
    
    // Log phone sources for debugging
    if (!finalPhone) {
      console.error(`❌ CRITICAL: No phone number found for call ${vapiResult.call?.id}`);
      console.log('   Webhook phone:', phoneFromWebhook);
      console.log('   Queue phone:', phoneFromQueue);
      console.log('   VAPI result:', JSON.stringify(vapiResult, null, 2));
    } else {
      console.log(`✅ Phone number found: ${finalPhone} (from ${phoneFromWebhook ? 'webhook' : 'queue'})`);
    }
    
    const callRecord = {
      id: vapiResult.call?.id || queuedCall.last_call_id,
      campaign_id: queuedCall.campaignId,
      customer_name: finalName,
      customer_phone: finalPhone,  // ⭐ FIXED ⭐
      outcome: outcome,
      duration: vapiResult.call?.duration || vapiResult.duration || 0,  // ⭐ FIXED: Use 'duration' not 'duration_seconds' ⭐
      cost: vapiResult.call?.cost || vapiResult.cost || 0,
      started_at: vapiResult.call?.startedAt || queuedCall.last_attempt_at,  // ⭐ FIXED: Use 'started_at' not 'call_started_at' ⭐
      ended_at: vapiResult.call?.endedAt || new Date().toISOString(),  // ⭐ FIXED: Use 'ended_at' not 'call_ended_at' ⭐
      transcript: vapiResult.transcript || vapiResult.call?.transcript || null,
      recording_url: vapiResult.recordingUrl || vapiResult.call?.recordingUrl || vapiResult.call?.stereoRecordingUrl || null,
      vapi_call_id: vapiResult.call?.id,
      organization_id: campaign?.organization_id,
      contact_info: {
        phone: finalPhone,  // ⭐ FIXED ⭐
        name: finalName,
        source: phoneFromWebhook ? 'vapi_webhook' : 'call_queue'
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: savedCall, error } = await supabase
      .from('calls')
      .upsert(callRecord, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      console.error('❌ Error saving call record:', error);
      return;
    }

    // If call has ended and has transcript, trigger AI processing
    const transcript = vapiResult.transcript || vapiResult.call?.transcript;
    if (transcript) {
      console.log('🤖 Triggering AI processing for call:', savedCall.id);
      console.log(`   Initial outcome: ${outcome} (will be updated by AI)`);
      
      // Update status to processing
      await supabase
        .from('calls')
        .update({ 
          status: 'processing',
          updated_at: new Date().toISOString()
        })
        .eq('id', savedCall.id);
      
      try {
        // Use enhanced AI processor for better extraction
        const { processCallWithEnhancedAI } = await import('./enhanced-ai-processor');
        
        // Pass transcript and full VAPI data for comprehensive extraction
        const vapiCallData = {
          ...vapiResult.call,
          transcript: transcript,
          summary: vapiResult.summary || vapiResult.call?.summary,
          analysis: vapiResult.analysis || vapiResult.call?.analysis
        };
        // Use enhanced AI processor with better extraction
        await processCallWithEnhancedAI(savedCall.id, transcript, vapiCallData);
      } catch (aiError) {
        console.error('❌ AI processing failed:', aiError);
        // Update status back to completed if AI fails
        await supabase
          .from('calls')
          .update({ 
            status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', savedCall.id);
      }
    } else {
      console.log('⚠️  No transcript available for AI processing');
    }
  }

  /**
   * Schedule retry if needed based on campaign settings
   */
  private async scheduleRetryIfNeeded(queuedCall: QueuedCall, outcome: string) {
    // Get campaign settings
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select('retry_settings')
      .eq('id', queuedCall.campaignId)
      .single();

    if (error || !campaign) return;

    const retrySettings = campaign.retry_settings;
    
    if (!retrySettings?.enableRetries) return;
    if (queuedCall.attempt >= retrySettings.maxRetries) return;

    // Check if we should retry for this outcome
    const shouldRetry = (
      (outcome === 'no_answer' && retrySettings.retryOnNoAnswer) ||
      (outcome === 'busy' && retrySettings.retryOnBusy) ||
      (outcome === 'voicemail' && retrySettings.retryOnVoicemail) ||
      (outcome === 'failed' && retrySettings.retryOnFailed) ||
      (outcome === 'quick_hangup' && (retrySettings.retryOnQuickHangup ?? true)) ||
      (outcome === 'provider_error' && (retrySettings.retryOnFailed ?? true)) ||
      (outcome === 'system_error' && (retrySettings.retryOnFailed ?? true))
    );

    if (!shouldRetry) return;

    // Calculate next retry time
    const delay = retrySettings.retryDelay;
    const unit = retrySettings.retryDelayUnit;
    const nextRetry = unit === 'hours' 
      ? addHours(new Date(), delay)
      : addDays(new Date(), delay);

    // Create new retry entry
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

    await supabase
      .from('call_queue')
      .insert(retryEntry);

    console.log(`🔄 Scheduled retry for ${queuedCall.contactName} at ${format(nextRetry, 'PPpp')}`);
  }

  /**
   * Pause a campaign
   */
  async pauseCampaign(campaignId: string) {
    await supabase
      .from('campaigns')
      .update({ 
        status: 'paused',
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId);

    console.log(`⏸️ Campaign ${campaignId} paused`);
  }

  /**
   * Resume a campaign
   */
  async resumeCampaign(campaignId: string) {
    await supabase
      .from('campaigns')
      .update({ 
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId);

    console.log(`▶️ Campaign ${campaignId} resumed`);
  }

  /**
   * Get campaign status and metrics
   */
  async getCampaignStatus(campaignId: string) {
    const [campaignResult, queueResult, callsResult] = await Promise.all([
      supabase.from('campaigns').select('*').eq('id', campaignId).single(),
      supabase.from('call_queue').select('*').eq('campaign_id', campaignId),
      supabase.from('calls').select('*').eq('campaign_id', campaignId)
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

// Export singleton instance
export const campaignExecutor = new CampaignExecutor();