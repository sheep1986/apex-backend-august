import { Twilio } from 'twilio';
import { createClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  webhookUrl: string;
  statusCallbackUrl: string;
}

interface CallSession {
  id: string;
  accountId: string;
  campaignId: string;
  leadId: string;
  flowId: string;
  callSid?: string;
  status: string;
  phoneNumber: string;
  callerIdUsed: string;
}

interface CallOptions {
  to: string;
  from: string;
  flowId: string;
  leadId: string;
  campaignId: string;
  accountId: string;
  recordCall?: boolean;
  timeout?: number;
  machineDetection?: boolean;
}

export class TwilioCallService {
  private client: Twilio;
  private supabase: any;
  private websocketManager: any;
  private config: TwilioConfig;

  constructor(config: TwilioConfig, supabaseUrl: string, supabaseKey: string) {
    this.client = new Twilio(config.accountSid, config.authToken);
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.config = config;
  }

  /**
   * Initiate an outbound call with AI flow execution
   */
  async initiateCall(options: CallOptions): Promise<CallSession> {
    try {
      // Create call session record first
      const callSession = await this.createCallSession(options);
      
      // Select optimal caller ID from pool
      const optimalCallerId = await this.selectOptimalCallerId(options.accountId, options.to);
      
      // Create Twilio call with webhook URL for flow execution
      const call = await this.client.calls.create({
        to: options.to,
        from: optimalCallerId || options.from,
        url: `${this.config.webhookUrl}/execute-flow/${options.flowId}`,
        statusCallback: `${this.config.statusCallbackUrl}/call-status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
        record: options.recordCall || true,
        recordingStatusCallback: `${this.config.webhookUrl}/recording-ready`,
        timeout: options.timeout || 30,
        machineDetection: options.machineDetection ? 'Enable' : 'Disable',
        machineDetectionTimeout: 5,
        machineDetectionSpeechThreshold: 2000,
        machineDetectionSpeechEndThreshold: 1200,
        machineDetectionSilenceTimeout: 5000
      });

      // Update call session with Twilio SID
      const updatedSession = await this.updateCallSession(callSession.id, {
        twilio_call_sid: call.sid,
        status: 'dialing',
        caller_id_used: optimalCallerId || options.from,
        started_at: new Date()
      });

      // Broadcast real-time update
      await this.broadcastCallUpdate(callSession.id, {
        status: 'dialing',
        callSid: call.sid,
        timestamp: new Date()
      });

      return updatedSession;
    } catch (error) {
      console.error('Error initiating call:', error);
      throw new Error(`Failed to initiate call: ${error.message}`);
    }
  }

  /**
   * Handle inbound calls with intelligent routing
   */
  async handleInboundCall(request: any): Promise<string> {
    try {
      const { From, To, CallSid } = request.body;
      
      // Create call session for inbound call
      const callSession = await this.createInboundCallSession({
        callSid: CallSid,
        from: From,
        to: To
      });

      // Determine routing based on caller ID or business rules
      const routingDecision = await this.determineInboundRouting(From, To);
      
      // Generate TwiML response
      const twiml = this.generateInboundTwiML(routingDecision);
      
      return twiml;
    } catch (error) {
      console.error('Error handling inbound call:', error);
      return this.generateErrorTwiML();
    }
  }

  /**
   * Handle call status updates from Twilio webhooks
   */
  async handleCallStatus(request: any): Promise<void> {
    try {
      const { CallSid, CallStatus, Duration, RecordingUrl } = request.body;
      
      // Find call session by Twilio SID
      const callSession = await this.getCallSessionByTwilioSid(CallSid);
      if (!callSession) {
        console.warn(`Call session not found for SID: ${CallSid}`);
        return;
      }

      // Update call session status
      const updates: any = {
        status: this.mapTwilioStatusToInternal(CallStatus),
        updated_at: new Date()
      };

      if (Duration) {
        updates.duration = parseInt(Duration);
        updates.billable_duration = parseInt(Duration);
      }

      if (RecordingUrl) {
        updates.recording_url = RecordingUrl;
      }

      if (CallStatus === 'completed') {
        updates.ended_at = new Date();
        // Trigger post-call processing
        await this.processCallCompletion(callSession);
      }

      await this.updateCallSession(callSession.id, updates);

      // Broadcast real-time update
      await this.broadcastCallUpdate(callSession.id, {
        status: updates.status,
        duration: updates.duration,
        timestamp: new Date()
      });

      // Update campaign metrics
      await this.updateCampaignMetrics(callSession.campaign_id, updates.status);

    } catch (error) {
      console.error('Error handling call status:', error);
    }
  }

  /**
   * Handle call recording completion
   */
  async handleRecordingReady(request: any): Promise<void> {
    try {
      const { CallSid, RecordingUrl, RecordingDuration } = request.body;
      
      const callSession = await this.getCallSessionByTwilioSid(CallSid);
      if (!callSession) return;

      await this.updateCallSession(callSession.id, {
        recording_url: RecordingUrl,
        recording_duration: parseInt(RecordingDuration) || 0
      });

      // Trigger transcription if enabled
      if (callSession.account_settings?.enableTranscription) {
        await this.initiateTranscription(callSession.id, RecordingUrl);
      }

    } catch (error) {
      console.error('Error handling recording ready:', error);
    }
  }

  /**
   * Transfer call to human agent or queue
   */
  async transferCall(callSid: string, destination: string, transferType: 'agent' | 'queue' | 'phone'): Promise<boolean> {
    try {
      let transferUrl = '';
      
      switch (transferType) {
        case 'agent':
          transferUrl = `${this.config.webhookUrl}/transfer-to-agent/${destination}`;
          break;
        case 'queue':
          transferUrl = `${this.config.webhookUrl}/transfer-to-queue/${destination}`;
          break;
        case 'phone':
          transferUrl = `${this.config.webhookUrl}/transfer-to-phone/${destination}`;
          break;
      }

      // Use Twilio's REST API to modify the call
      await this.client.calls(callSid).update({
        url: transferUrl,
        method: 'POST'
      });

      return true;
    } catch (error) {
      console.error('Error transferring call:', error);
      return false;
    }
  }

  /**
   * Enable supervisor whisper (supervisor can speak to agent without customer hearing)
   */
  async enableSupervisorWhisper(callSid: string, supervisorCallSid: string, message: string): Promise<boolean> {
    try {
      // Create conference for whisper functionality
      const conference = await this.client.conferences.create({
        friendlyName: `whisper-${callSid}`,
        statusCallback: `${this.config.webhookUrl}/conference-status`,
        statusCallbackEvent: ['start', 'end', 'join', 'leave'],
        record: false
      });

      // Add existing call to conference
      await this.client.calls(callSid).update({
        url: `${this.config.webhookUrl}/join-conference/${conference.sid}`,
        method: 'POST'
      });

      // Add supervisor to conference with whisper capability
      await this.client.calls.create({
        to: supervisorCallSid,
        from: '+1234567890', // System number
        url: `${this.config.webhookUrl}/supervisor-whisper/${conference.sid}`,
        statusCallback: `${this.config.webhookUrl}/supervisor-status`
      });

      return true;
    } catch (error) {
      console.error('Error enabling supervisor whisper:', error);
      return false;
    }
  }

  /**
   * Initiate call recording with compliance
   */
  async startRecording(callSid: string, consentCaptured: boolean = false): Promise<string | null> {
    try {
      if (!consentCaptured) {
        // Play consent notice first
        await this.client.calls(callSid).update({
          url: `${this.config.webhookUrl}/recording-consent-notice`,
          method: 'POST'
        });
      }

      const recording = await this.client.calls(callSid).recordings.create({
        recordingStatusCallback: `${this.config.webhookUrl}/recording-status`
      });

      return recording.sid;
    } catch (error) {
      console.error('Error starting recording:', error);
      return null;
    }
  }

  /**
   * Caller ID management and optimization
   */
  private async selectOptimalCallerId(accountId: string, destinationNumber: string): Promise<string | null> {
    try {
      // Get available caller IDs for account
      const { data: callerIds } = await this.supabase
        .from('caller_ids')
        .select('*')
        .eq('account_id', accountId)
        .eq('is_active', true)
        .eq('is_verified', true);

      if (!callerIds || callerIds.length === 0) {
        return null;
      }

      // Simple round-robin selection (could be enhanced with local presence logic)
      const randomIndex = Math.floor(Math.random() * callerIds.length);
      return callerIds[randomIndex].phone_number;

    } catch (error) {
      console.error('Error selecting caller ID:', error);
      return null;
    }
  }

  /**
   * Voicemail detection and handling
   */
  async handleVoicemailDetection(callSid: string, machineDetectionResult: string): Promise<void> {
    try {
      const callSession = await this.getCallSessionByTwilioSid(callSid);
      if (!callSession) return;

      const voicemailSettings = callSession.campaign?.dialer_settings?.voicemailSettings;
      
      if (machineDetectionResult === 'machine' && voicemailSettings?.dropVoicemail) {
        // Hang up immediately
        await this.client.calls(callSid).update({ status: 'completed' });
        
        await this.updateCallSession(callSession.id, {
          disposition: 'voicemail',
          status: 'completed',
          ended_at: new Date()
        });
      } else if (machineDetectionResult === 'machine' && voicemailSettings?.voicemailMessage) {
        // Play voicemail message
        await this.client.calls(callSid).update({
          url: `${this.config.webhookUrl}/play-voicemail/${callSession.id}`,
          method: 'POST'
        });
      }

    } catch (error) {
      console.error('Error handling voicemail detection:', error);
    }
  }

  /**
   * Generate TwiML for various scenarios
   */
  private generateInboundTwiML(routingDecision: any): string {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for calling. Please hold while we connect you.</Say>
  <Dial>
    <Queue>${routingDecision.queue}</Queue>
  </Dial>
</Response>`;
    return twiml;
  }

  private generateErrorTwiML(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We're sorry, but we're experiencing technical difficulties. Please try calling back later.</Say>
  <Hangup/>
</Response>`;
  }

  /**
   * Database operations
   */
  private async createCallSession(options: CallOptions): Promise<CallSession> {
    const { data, error } = await this.supabase
      .from('call_sessions')
      .insert([{
        account_id: options.accountId,
        campaign_id: options.campaignId,
        lead_id: options.leadId,
        flow_id: options.flowId,
        callee_number: options.to,
        status: 'queued',
        direction: 'outbound',
        scheduled_at: new Date()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  private async createInboundCallSession(options: any): Promise<CallSession> {
    const { data, error } = await this.supabase
      .from('call_sessions')
      .insert([{
        twilio_call_sid: options.callSid,
        caller_number: options.from,
        callee_number: options.to,
        status: 'active',
        direction: 'inbound',
        started_at: new Date()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  private async updateCallSession(sessionId: string, updates: any): Promise<any> {
    const { data, error } = await this.supabase
      .from('call_sessions')
      .update(updates)
      .eq('id', sessionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  private async getCallSessionByTwilioSid(twilioSid: string): Promise<any> {
    const { data, error } = await this.supabase
      .from('call_sessions')
      .select('*, campaign:campaigns(*), lead:leads(*)')
      .eq('twilio_call_sid', twilioSid)
      .single();

    if (error) return null;
    return data;
  }

  /**
   * Real-time updates and notifications
   */
  private async broadcastCallUpdate(sessionId: string, update: any): Promise<void> {
    // Implementation would depend on your WebSocket setup
    // This is a placeholder for real-time updates
    console.log(`Broadcasting update for session ${sessionId}:`, update);
  }

  /**
   * AI Transcription and Processing
   */
  private async initiateTranscription(sessionId: string, recordingUrl: string): Promise<void> {
    try {
      // This would integrate with your AI service (OpenAI Whisper, etc.)
      // Placeholder implementation
      console.log(`Initiating transcription for session ${sessionId}`);
      
      // Would make API call to transcription service
      // Then update call_sessions with transcript data
      
    } catch (error) {
      console.error('Error initiating transcription:', error);
    }
  }

  /**
   * Campaign metrics and analytics
   */
  private async updateCampaignMetrics(campaignId: string, callStatus: string): Promise<void> {
    try {
      // Update campaign performance metrics
      const { data, error } = await this.supabase.rpc('update_campaign_metrics', {
        p_campaign_id: campaignId,
        p_call_status: callStatus
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error updating campaign metrics:', error);
    }
  }

  /**
   * Post-call processing
   */
  private async processCallCompletion(callSession: any): Promise<void> {
    try {
      // Update lead status based on call outcome
      if (callSession.disposition === 'connected') {
        await this.supabase
          .from('leads')
          .update({ 
            status: 'contacted',
            last_contacted_at: new Date()
          })
          .eq('id', callSession.lead_id);
      }

      // Schedule follow-up if needed
      await this.scheduleFollowUp(callSession);

      // Trigger webhook notifications
      await this.triggerWebhookNotifications(callSession);

    } catch (error) {
      console.error('Error in post-call processing:', error);
    }
  }

  private async scheduleFollowUp(callSession: any): Promise<void> {
    // Implement follow-up scheduling logic
  }

  private async triggerWebhookNotifications(callSession: any): Promise<void> {
    // Implement webhook notifications
  }

  private async determineInboundRouting(from: string, to: string): Promise<any> {
    // Implement intelligent routing logic
    return { queue: 'general-support' };
  }

  private mapTwilioStatusToInternal(twilioStatus: string): string {
    const statusMap: { [key: string]: string } = {
      'queued': 'queued',
      'initiated': 'dialing',
      'ringing': 'ringing',
      'in-progress': 'active',
      'completed': 'completed',
      'busy': 'failed',
      'no-answer': 'failed',
      'canceled': 'cancelled',
      'failed': 'failed'
    };

    return statusMap[twilioStatus] || 'unknown';
  }
}

export default TwilioCallService;
