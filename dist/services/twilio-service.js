"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwilioCallService = void 0;
const twilio_1 = require("twilio");
const supabase_js_1 = require("@supabase/supabase-js");
class TwilioCallService {
    constructor(config, supabaseUrl, supabaseKey) {
        this.client = new twilio_1.Twilio(config.accountSid, config.authToken);
        this.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
        this.config = config;
    }
    async initiateCall(options) {
        try {
            const callSession = await this.createCallSession(options);
            const optimalCallerId = await this.selectOptimalCallerId(options.accountId, options.to);
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
            const updatedSession = await this.updateCallSession(callSession.id, {
                twilio_call_sid: call.sid,
                status: 'dialing',
                caller_id_used: optimalCallerId || options.from,
                started_at: new Date()
            });
            await this.broadcastCallUpdate(callSession.id, {
                status: 'dialing',
                callSid: call.sid,
                timestamp: new Date()
            });
            return updatedSession;
        }
        catch (error) {
            console.error('Error initiating call:', error);
            throw new Error(`Failed to initiate call: ${error.message}`);
        }
    }
    async handleInboundCall(request) {
        try {
            const { From, To, CallSid } = request.body;
            const callSession = await this.createInboundCallSession({
                callSid: CallSid,
                from: From,
                to: To
            });
            const routingDecision = await this.determineInboundRouting(From, To);
            const twiml = this.generateInboundTwiML(routingDecision);
            return twiml;
        }
        catch (error) {
            console.error('Error handling inbound call:', error);
            return this.generateErrorTwiML();
        }
    }
    async handleCallStatus(request) {
        try {
            const { CallSid, CallStatus, Duration, RecordingUrl } = request.body;
            const callSession = await this.getCallSessionByTwilioSid(CallSid);
            if (!callSession) {
                console.warn(`Call session not found for SID: ${CallSid}`);
                return;
            }
            const updates = {
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
                await this.processCallCompletion(callSession);
            }
            await this.updateCallSession(callSession.id, updates);
            await this.broadcastCallUpdate(callSession.id, {
                status: updates.status,
                duration: updates.duration,
                timestamp: new Date()
            });
            await this.updateCampaignMetrics(callSession.campaign_id, updates.status);
        }
        catch (error) {
            console.error('Error handling call status:', error);
        }
    }
    async handleRecordingReady(request) {
        try {
            const { CallSid, RecordingUrl, RecordingDuration } = request.body;
            const callSession = await this.getCallSessionByTwilioSid(CallSid);
            if (!callSession)
                return;
            await this.updateCallSession(callSession.id, {
                recording_url: RecordingUrl,
                recording_duration: parseInt(RecordingDuration) || 0
            });
            if (callSession.account_settings?.enableTranscription) {
                await this.initiateTranscription(callSession.id, RecordingUrl);
            }
        }
        catch (error) {
            console.error('Error handling recording ready:', error);
        }
    }
    async transferCall(callSid, destination, transferType) {
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
            await this.client.calls(callSid).update({
                url: transferUrl,
                method: 'POST'
            });
            return true;
        }
        catch (error) {
            console.error('Error transferring call:', error);
            return false;
        }
    }
    async enableSupervisorWhisper(callSid, supervisorCallSid, message) {
        try {
            const conference = await this.client.conferences.create({
                friendlyName: `whisper-${callSid}`,
                statusCallback: `${this.config.webhookUrl}/conference-status`,
                statusCallbackEvent: ['start', 'end', 'join', 'leave'],
                record: false
            });
            await this.client.calls(callSid).update({
                url: `${this.config.webhookUrl}/join-conference/${conference.sid}`,
                method: 'POST'
            });
            await this.client.calls.create({
                to: supervisorCallSid,
                from: '+1234567890',
                url: `${this.config.webhookUrl}/supervisor-whisper/${conference.sid}`,
                statusCallback: `${this.config.webhookUrl}/supervisor-status`
            });
            return true;
        }
        catch (error) {
            console.error('Error enabling supervisor whisper:', error);
            return false;
        }
    }
    async startRecording(callSid, consentCaptured = false) {
        try {
            if (!consentCaptured) {
                await this.client.calls(callSid).update({
                    url: `${this.config.webhookUrl}/recording-consent-notice`,
                    method: 'POST'
                });
            }
            const recording = await this.client.calls(callSid).recordings.create({
                recordingStatusCallback: `${this.config.webhookUrl}/recording-status`
            });
            return recording.sid;
        }
        catch (error) {
            console.error('Error starting recording:', error);
            return null;
        }
    }
    async selectOptimalCallerId(accountId, destinationNumber) {
        try {
            const { data: callerIds } = await this.supabase
                .from('caller_ids')
                .select('*')
                .eq('account_id', accountId)
                .eq('is_active', true)
                .eq('is_verified', true);
            if (!callerIds || callerIds.length === 0) {
                return null;
            }
            const randomIndex = Math.floor(Math.random() * callerIds.length);
            return callerIds[randomIndex].phone_number;
        }
        catch (error) {
            console.error('Error selecting caller ID:', error);
            return null;
        }
    }
    async handleVoicemailDetection(callSid, machineDetectionResult) {
        try {
            const callSession = await this.getCallSessionByTwilioSid(callSid);
            if (!callSession)
                return;
            const voicemailSettings = callSession.campaign?.dialer_settings?.voicemailSettings;
            if (machineDetectionResult === 'machine' && voicemailSettings?.dropVoicemail) {
                await this.client.calls(callSid).update({ status: 'completed' });
                await this.updateCallSession(callSession.id, {
                    disposition: 'voicemail',
                    status: 'completed',
                    ended_at: new Date()
                });
            }
            else if (machineDetectionResult === 'machine' && voicemailSettings?.voicemailMessage) {
                await this.client.calls(callSid).update({
                    url: `${this.config.webhookUrl}/play-voicemail/${callSession.id}`,
                    method: 'POST'
                });
            }
        }
        catch (error) {
            console.error('Error handling voicemail detection:', error);
        }
    }
    generateInboundTwiML(routingDecision) {
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for calling. Please hold while we connect you.</Say>
  <Dial>
    <Queue>${routingDecision.queue}</Queue>
  </Dial>
</Response>`;
        return twiml;
    }
    generateErrorTwiML() {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We're sorry, but we're experiencing technical difficulties. Please try calling back later.</Say>
  <Hangup/>
</Response>`;
    }
    async createCallSession(options) {
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
        if (error)
            throw error;
        return data;
    }
    async createInboundCallSession(options) {
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
        if (error)
            throw error;
        return data;
    }
    async updateCallSession(sessionId, updates) {
        const { data, error } = await this.supabase
            .from('call_sessions')
            .update(updates)
            .eq('id', sessionId)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
    async getCallSessionByTwilioSid(twilioSid) {
        const { data, error } = await this.supabase
            .from('call_sessions')
            .select('*, campaign:campaigns(*), lead:leads(*)')
            .eq('twilio_call_sid', twilioSid)
            .single();
        if (error)
            return null;
        return data;
    }
    async broadcastCallUpdate(sessionId, update) {
        console.log(`Broadcasting update for session ${sessionId}:`, update);
    }
    async initiateTranscription(sessionId, recordingUrl) {
        try {
            console.log(`Initiating transcription for session ${sessionId}`);
        }
        catch (error) {
            console.error('Error initiating transcription:', error);
        }
    }
    async updateCampaignMetrics(campaignId, callStatus) {
        try {
            const { data, error } = await this.supabase.rpc('update_campaign_metrics', {
                p_campaign_id: campaignId,
                p_call_status: callStatus
            });
            if (error)
                throw error;
        }
        catch (error) {
            console.error('Error updating campaign metrics:', error);
        }
    }
    async processCallCompletion(callSession) {
        try {
            if (callSession.disposition === 'connected') {
                await this.supabase
                    .from('leads')
                    .update({
                    status: 'contacted',
                    last_contacted_at: new Date()
                })
                    .eq('id', callSession.lead_id);
            }
            await this.scheduleFollowUp(callSession);
            await this.triggerWebhookNotifications(callSession);
        }
        catch (error) {
            console.error('Error in post-call processing:', error);
        }
    }
    async scheduleFollowUp(callSession) {
    }
    async triggerWebhookNotifications(callSession) {
    }
    async determineInboundRouting(from, to) {
        return { queue: 'general-support' };
    }
    mapTwilioStatusToInternal(twilioStatus) {
        const statusMap = {
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
exports.TwilioCallService = TwilioCallService;
exports.default = TwilioCallService;
