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
exports.WebhookService = void 0;
const events_1 = require("events");
const crypto = __importStar(require("crypto"));
const ws_1 = require("ws");
class WebhookService extends events_1.EventEmitter {
    constructor(pool, callAnalysisService) {
        super();
        this.pool = pool;
        this.webhookSecret = process.env.VAPI_WEBHOOK_SECRET || 'default-secret';
        this.wsClients = new Map();
        this.callAnalysisService = callAnalysisService;
    }
    async processVapiWebhook(payload, signature) {
        try {
            if (!this.verifySignature(payload, signature)) {
                throw new Error('Invalid webhook signature');
            }
            console.log(`📡 Processing VAPI webhook: ${payload.type}`);
            await this.logWebhookEvent(payload);
            switch (payload.type) {
                case 'call-start':
                    await this.handleCallStart(payload.data);
                    break;
                case 'call-end':
                    await this.handleCallEnd(payload.data);
                    break;
                case 'transcript':
                    await this.handleTranscript(payload.data);
                    break;
                case 'function-call':
                case 'tool-call':
                    await this.handleToolCall(payload.data);
                    break;
                case 'speech-update':
                    await this.handleSpeechUpdate(payload.data);
                    break;
                case 'hang':
                    await this.handleHang(payload.data);
                    break;
                case 'error':
                    await this.handleError(payload.data);
                    break;
                default:
                    console.warn(`Unknown webhook type: ${payload.type}`);
            }
            this.emit('webhook_processed', {
                type: payload.type,
                callId: payload.data.call.id,
                timestamp: payload.timestamp
            });
        }
        catch (error) {
            console.error('Webhook processing error:', error);
            await this.logWebhookError(payload, error);
        }
    }
    async handleCallStart(data) {
        const { call } = data;
        const client = await this.pool.connect();
        try {
            console.log(`📞 Call started: ${call.id}`);
            await client.query(`
        UPDATE vapi_call_attempts 
        SET 
          status = 'ringing',
          started_at = NOW(),
          vapi_call_id = $1
        WHERE vapi_call_id = $1 OR id = $2
      `, [call.id, call.id]);
            const callInfo = await this.getCallInfo(call.id);
            if (callInfo) {
                this.broadcastToClients('call_started', {
                    call_id: call.id,
                    campaign_id: callInfo.campaign_id,
                    lead_name: callInfo.lead_name,
                    phone_number: call.customer.number,
                    started_at: call.startedAt
                });
                await this.updateCampaignMetrics(callInfo.campaign_id, 'call_started');
            }
        }
        finally {
            client.release();
        }
    }
    async handleCallEnd(data) {
        const { call } = data;
        const client = await this.pool.connect();
        try {
            console.log(`📞 Call ended: ${call.id}, Status: ${call.status}, Duration: ${call.duration}s`);
            await client.query('BEGIN');
            await client.query(`
        UPDATE vapi_call_attempts 
        SET 
          status = $1,
          ended_at = NOW(),
          duration_seconds = $2,
          cost = $3
        WHERE vapi_call_id = $4
      `, [
                this.mapVapiStatusToInternal(call.status),
                call.duration || 0,
                call.cost || 0,
                call.id
            ]);
            const callInfo = await this.getCallInfo(call.id);
            if (callInfo) {
                if (call.status === 'ended' && call.transcript && this.callAnalysisService) {
                    console.log('🤖 Triggering call analysis...');
                    try {
                        await this.callAnalysisService.analyzeCall({
                            callId: call.id,
                            transcript: call.transcript,
                            duration: call.duration,
                            recordingUrl: call.recordingUrl,
                            summary: call.summary,
                            leadId: callInfo.lead_id,
                            campaignId: callInfo.campaign_id
                        });
                    }
                    catch (analysisError) {
                        console.error('Call analysis failed:', analysisError);
                    }
                }
                await this.updateLeadStatus(callInfo.lead_id, call);
                await this.updateCampaignMetrics(callInfo.campaign_id, 'call_ended', {
                    duration: call.duration,
                    cost: call.cost,
                    status: call.status
                });
                this.broadcastToClients('call_ended', {
                    call_id: call.id,
                    campaign_id: callInfo.campaign_id,
                    lead_name: callInfo.lead_name,
                    phone_number: call.customer.number,
                    duration: call.duration,
                    cost: call.cost,
                    status: call.status,
                    recording_url: call.recordingUrl
                });
                await this.scheduleFollowUp(callInfo.lead_id, call);
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
    async handleTranscript(data) {
        const { call, transcript } = data;
        if (!transcript)
            return;
        console.log(`📝 Transcript update for call ${call.id}`);
        await this.storeTranscriptChunk(call.id, transcript);
        const callInfo = await this.getCallInfo(call.id);
        if (callInfo) {
            this.broadcastToClients('transcript_update', {
                call_id: call.id,
                campaign_id: callInfo.campaign_id,
                transcript: transcript,
                timestamp: new Date().toISOString()
            });
        }
    }
    async handleToolCall(data) {
        const { call, tool } = data;
        console.log(`🛠️  Tool call for ${call.id}: ${tool.name}`);
        await this.logToolUsage(call.id, tool);
        switch (tool.name) {
            case 'schedule_callback':
                await this.handleScheduleCallback(call.id, tool.parameters);
                break;
            case 'transfer_call':
                await this.handleTransferCall(call.id, tool.parameters);
                break;
            case 'capture_lead_info':
                await this.handleCaptureLeadInfo(call.id, tool.parameters);
                break;
            case 'set_appointment':
                await this.handleSetAppointment(call.id, tool.parameters);
                break;
            default:
                console.log(`Unknown tool: ${tool.name}`);
        }
    }
    async handleSpeechUpdate(data) {
        const { call } = data;
        const callInfo = await this.getCallInfo(call.id);
        if (callInfo) {
            this.broadcastToClients('speech_update', {
                call_id: call.id,
                campaign_id: callInfo.campaign_id,
                speech_data: data
            });
        }
    }
    async handleHang(data) {
        const { call } = data;
        console.log(`📞 Call hung up: ${call.id}`);
        const client = await this.pool.connect();
        try {
            await client.query(`
        UPDATE vapi_call_attempts 
        SET status = 'completed'
        WHERE vapi_call_id = $1
      `, [call.id]);
        }
        finally {
            client.release();
        }
    }
    async handleError(data) {
        const { call, error } = data;
        console.error(`❌ Call error for ${call.id}:`, error);
        const client = await this.pool.connect();
        try {
            await client.query(`
        UPDATE vapi_call_attempts 
        SET 
          status = 'failed',
          ended_at = NOW()
        WHERE vapi_call_id = $1
      `, [call.id]);
            const callInfo = await this.getCallInfo(call.id);
            if (callInfo) {
                this.broadcastToClients('call_error', {
                    call_id: call.id,
                    campaign_id: callInfo.campaign_id,
                    error: error
                });
            }
        }
        finally {
            client.release();
        }
    }
    verifySignature(payload, signature) {
        if (!signature)
            return false;
        try {
            const hmac = crypto.createHmac('sha256', this.webhookSecret);
            hmac.update(JSON.stringify(payload));
            const expectedSignature = 'sha256=' + hmac.digest('hex');
            return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
        }
        catch (error) {
            console.error('Signature verification error:', error);
            return false;
        }
    }
    async getCallInfo(vapiCallId) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
        SELECT 
          vca.campaign_id,
          vca.lead_id,
          vca.account_id,
          cl.first_name || ' ' || cl.last_name as lead_name,
          cl.phone_number
        FROM vapi_call_attempts vca
        JOIN crm_leads cl ON cl.id = vca.lead_id
        WHERE vca.vapi_call_id = $1
      `, [vapiCallId]);
            return result.rows[0] || null;
        }
        finally {
            client.release();
        }
    }
    mapVapiStatusToInternal(vapiStatus) {
        const statusMap = {
            'queued': 'initiated',
            'ringing': 'ringing',
            'in-progress': 'connected',
            'forwarding': 'connected',
            'ended': 'completed',
            'failed': 'failed',
            'busy': 'busy',
            'no-answer': 'no_answer',
            'voicemail': 'voicemail'
        };
        return statusMap[vapiStatus] || 'failed';
    }
    async storeTranscriptChunk(callId, transcript) {
        const client = await this.pool.connect();
        try {
            const existingResult = await client.query(`
        SELECT id FROM vapi_call_transcripts 
        WHERE vapi_call_id = $1
      `, [callId]);
            if (existingResult.rows.length === 0) {
                await client.query(`
          INSERT INTO vapi_call_transcripts (
            call_attempt_id, vapi_call_id, transcript, created_at
          ) VALUES (
            (SELECT id FROM vapi_call_attempts WHERE vapi_call_id = $1),
            $1, $2, NOW()
          )
        `, [callId, JSON.stringify([transcript])]);
            }
            else {
                await client.query(`
          UPDATE vapi_call_transcripts 
          SET transcript = transcript || $2
          WHERE vapi_call_id = $1
        `, [callId, JSON.stringify([transcript])]);
            }
        }
        finally {
            client.release();
        }
    }
    async updateLeadStatus(leadId, call) {
        const client = await this.pool.connect();
        try {
            let newStatus = 'contacted';
            let nextCallAt = null;
            if (call.endedReason) {
                switch (call.endedReason.toLowerCase()) {
                    case 'customer_ended_call':
                        newStatus = 'contacted';
                        break;
                    case 'voicemail':
                        newStatus = 'contacted';
                        nextCallAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
                        break;
                    case 'no_answer':
                        newStatus = 'contacted';
                        nextCallAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
                        break;
                    case 'busy':
                        newStatus = 'contacted';
                        nextCallAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
                        break;
                    case 'assistant_ended_call':
                        newStatus = 'contacted';
                        break;
                }
            }
            await client.query(`
        UPDATE crm_leads 
        SET 
          status = $1,
          next_call_scheduled_at = $2,
          last_attempt_at = NOW(),
          updated_at = NOW()
        WHERE id = $3
      `, [newStatus, nextCallAt, leadId]);
        }
        finally {
            client.release();
        }
    }
    async updateCampaignMetrics(campaignId, eventType, data) {
        const client = await this.pool.connect();
        try {
            const metricsUpdate = {};
            if (eventType === 'call_started') {
                metricsUpdate.total_calls = 'performance_metrics->\'total_calls\'::int + 1';
            }
            else if (eventType === 'call_ended') {
                metricsUpdate.total_duration = `performance_metrics->\'total_duration\'::int + ${data.duration || 0}`;
                metricsUpdate.total_cost = `performance_metrics->\'total_cost\'::numeric + ${data.cost || 0}`;
                if (data.status === 'ended') {
                    metricsUpdate.successful_calls = 'performance_metrics->\'successful_calls\'::int + 1';
                }
            }
            if (Object.keys(metricsUpdate).length > 0) {
                const updateClause = Object.entries(metricsUpdate)
                    .map(([key, value]) => `'${key}', ${value}`)
                    .join(', ');
                await client.query(`
          UPDATE campaigns 
          SET performance_metrics = jsonb_set(
            performance_metrics, 
            '{}', 
            jsonb_build_object(${updateClause})
          )
          WHERE id = $1
        `, [campaignId]);
            }
        }
        finally {
            client.release();
        }
    }
    async scheduleFollowUp(leadId, call) {
        console.log(`📅 Schedule follow-up for lead ${leadId} based on call ${call.id}`);
    }
    async logWebhookEvent(payload) {
        const client = await this.pool.connect();
        try {
            await client.query(`
        INSERT INTO webhook_logs (
          event_type, payload, status, created_at
        ) VALUES ($1, $2, $3, NOW())
      `, [payload.type, JSON.stringify(payload), 'processed']);
        }
        catch (error) {
            console.error('Failed to log webhook event:', error);
        }
        finally {
            client.release();
        }
    }
    async logWebhookError(payload, error) {
        const client = await this.pool.connect();
        try {
            await client.query(`
        INSERT INTO webhook_logs (
          event_type, payload, status, error_message, created_at
        ) VALUES ($1, $2, $3, $4, NOW())
      `, [payload.type, JSON.stringify(payload), 'failed', error.message]);
        }
        catch (logError) {
            console.error('Failed to log webhook error:', logError);
        }
        finally {
            client.release();
        }
    }
    async logToolUsage(callId, tool) {
        const client = await this.pool.connect();
        try {
            await client.query(`
        INSERT INTO tool_usage_logs (
          call_id, tool_name, parameters, result, created_at
        ) VALUES ($1, $2, $3, $4, NOW())
      `, [callId, tool.name, JSON.stringify(tool.parameters), JSON.stringify(tool.result)]);
        }
        catch (error) {
            console.error('Failed to log tool usage:', error);
        }
        finally {
            client.release();
        }
    }
    async handleScheduleCallback(callId, parameters) {
        const client = await this.pool.connect();
        try {
            const callbackTime = new Date(parameters.callback_time);
            await client.query(`
        UPDATE crm_leads 
        SET 
          status = 'callback',
          next_call_scheduled_at = $1,
          updated_at = NOW()
        WHERE id = (
          SELECT lead_id FROM vapi_call_attempts WHERE vapi_call_id = $2
        )
      `, [callbackTime, callId]);
            console.log(`📅 Callback scheduled for ${callbackTime}`);
        }
        finally {
            client.release();
        }
    }
    async handleTransferCall(callId, parameters) {
        console.log(`📞 Transfer call ${callId} to ${parameters.transfer_to}`);
    }
    async handleCaptureLeadInfo(callId, parameters) {
        const client = await this.pool.connect();
        try {
            await client.query(`
        UPDATE crm_leads 
        SET custom_fields = custom_fields || $1
        WHERE id = (
          SELECT lead_id FROM vapi_call_attempts WHERE vapi_call_id = $2
        )
      `, [JSON.stringify(parameters), callId]);
            console.log(`📝 Lead info captured for call ${callId}`);
        }
        finally {
            client.release();
        }
    }
    async handleSetAppointment(callId, parameters) {
        const client = await this.pool.connect();
        try {
            const appointmentTime = new Date(parameters.appointment_time);
            await client.query(`
        UPDATE crm_leads 
        SET 
          status = 'qualified',
          next_call_scheduled_at = $1,
          updated_at = NOW()
        WHERE id = (
          SELECT lead_id FROM vapi_call_attempts WHERE vapi_call_id = $2
        )
      `, [appointmentTime, callId]);
            console.log(`📅 Appointment scheduled for ${appointmentTime}`);
        }
        finally {
            client.release();
        }
    }
    addWebSocketClient(ws, accountId, campaignId) {
        const clientId = crypto.randomUUID();
        this.wsClients.set(clientId, {
            id: clientId,
            ws,
            accountId,
            campaignId,
            lastHeartbeat: new Date()
        });
        ws.on('close', () => {
            this.wsClients.delete(clientId);
        });
        ws.on('message', (data) => {
            const client = this.wsClients.get(clientId);
            if (client) {
                client.lastHeartbeat = new Date();
            }
        });
        return clientId;
    }
    broadcastToClients(eventType, data) {
        const message = JSON.stringify({
            type: eventType,
            data,
            timestamp: new Date().toISOString()
        });
        this.wsClients.forEach((client) => {
            if (client.ws.readyState === ws_1.WebSocket.OPEN) {
                if (!data.campaign_id || !client.campaignId || client.campaignId === data.campaign_id) {
                    client.ws.send(message);
                }
            }
        });
    }
    async getWebhookStats() {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
        SELECT 
          COUNT(*) as total_webhooks,
          COUNT(*) FILTER (WHERE status = 'processed') as successful_webhooks,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_webhooks
        FROM webhook_logs
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);
            const errors = await client.query(`
        SELECT event_type, error_message, created_at
        FROM webhook_logs
        WHERE status = 'failed'
        AND created_at > NOW() - INTERVAL '24 hours'
        ORDER BY created_at DESC
        LIMIT 10
      `);
            return {
                total_webhooks: parseInt(result.rows[0].total_webhooks),
                successful_webhooks: parseInt(result.rows[0].successful_webhooks),
                failed_webhooks: parseInt(result.rows[0].failed_webhooks),
                recent_errors: errors.rows
            };
        }
        finally {
            client.release();
        }
    }
}
exports.WebhookService = WebhookService;
