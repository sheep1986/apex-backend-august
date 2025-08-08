import { Pool } from 'pg';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { WebSocket } from 'ws';

interface VapiWebhookPayload {
  type: 'call-start' | 'call-end' | 'transcript' | 'function-call' | 'tool-call' | 'speech-update' | 'hang' | 'error';
  data: {
    call: VapiCall;
    transcript?: VapiTranscript;
    tool?: VapiTool;
    error?: VapiError;
    [key: string]: any;
  };
  timestamp: string;
}

interface VapiCall {
  id: string;
  assistantId: string;
  phoneNumberId: string;
  customer: {
    number: string;
    name?: string;
  };
  status: 'queued' | 'ringing' | 'in-progress' | 'forwarding' | 'ended';
  type: 'inbound' | 'outbound';
  transcript?: string;
  recordingUrl?: string;
  summary?: string;
  endedReason?: string;
  duration?: number;
  cost?: number;
  startedAt?: string;
  endedAt?: string;
  metadata?: Record<string, any>;
}

interface VapiTranscript {
  user: string;
  assistant: string;
  timestamp: string;
  endOfSpeechDetected: boolean;
}

interface VapiTool {
  name: string;
  parameters: Record<string, any>;
  result?: any;
}

interface VapiError {
  code: string;
  message: string;
  details?: any;
}

interface WebSocketClient {
  id: string;
  ws: WebSocket;
  campaignId?: string;
  accountId: string;
  lastHeartbeat: Date;
}

export class WebhookService extends EventEmitter {
  private pool: Pool;
  private webhookSecret: string;
  private wsClients: Map<string, WebSocketClient>;
  private callAnalysisService: any; // Will be injected

  constructor(pool: Pool, callAnalysisService?: any) {
    super();
    this.pool = pool;
    this.webhookSecret = process.env.VAPI_WEBHOOK_SECRET || 'default-secret';
    this.wsClients = new Map();
    this.callAnalysisService = callAnalysisService;
  }

  /**
   * Process incoming VAPI webhook
   */
  async processVapiWebhook(payload: VapiWebhookPayload, signature: string): Promise<void> {
    try {
      // Verify webhook signature
      if (!this.verifySignature(payload, signature)) {
        throw new Error('Invalid webhook signature');
      }

      console.log(`📡 Processing VAPI webhook: ${payload.type}`);

      // Log webhook receipt
      await this.logWebhookEvent(payload);

      // Process based on event type
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

      // Emit event for real-time updates
      this.emit('webhook_processed', {
        type: payload.type,
        callId: payload.data.call.id,
        timestamp: payload.timestamp
      });

    } catch (error) {
      console.error('Webhook processing error:', error);
      
      // Log error but don't throw to avoid webhook retry loops
      await this.logWebhookError(payload, error);
    }
  }

  /**
   * Handle call start event
   */
  private async handleCallStart(data: any): Promise<void> {
    const { call } = data;
    const client = await this.pool.connect();

    try {
      console.log(`📞 Call started: ${call.id}`);

      // Update call attempt record
      await client.query(`
        UPDATE vapi_call_attempts 
        SET 
          status = 'ringing',
          started_at = NOW(),
          vapi_call_id = $1
        WHERE vapi_call_id = $1 OR id = $2
      `, [call.id, call.id]);

      // Get campaign and lead info
      const callInfo = await this.getCallInfo(call.id);
      
      if (callInfo) {
        // Broadcast to WebSocket clients
        this.broadcastToClients('call_started', {
          call_id: call.id,
          campaign_id: callInfo.campaign_id,
          lead_name: callInfo.lead_name,
          phone_number: call.customer.number,
          started_at: call.startedAt
        });

        // Update campaign metrics
        await this.updateCampaignMetrics(callInfo.campaign_id, 'call_started');
      }

    } finally {
      client.release();
    }
  }

  /**
   * Handle call end event
   */
  private async handleCallEnd(data: any): Promise<void> {
    const { call } = data;
    const client = await this.pool.connect();

    try {
      console.log(`📞 Call ended: ${call.id}, Status: ${call.status}, Duration: ${call.duration}s`);

      await client.query('BEGIN');

      // Update call attempt record
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

      // Get call info for further processing
      const callInfo = await this.getCallInfo(call.id);
      
      if (callInfo) {
        // If call was successful and has transcript, trigger analysis
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
          } catch (analysisError) {
            console.error('Call analysis failed:', analysisError);
          }
        }

        // Update lead status based on call outcome
        await this.updateLeadStatus(callInfo.lead_id, call);

        // Update campaign metrics
        await this.updateCampaignMetrics(callInfo.campaign_id, 'call_ended', {
          duration: call.duration,
          cost: call.cost,
          status: call.status
        });

        // Broadcast to WebSocket clients
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

        // Schedule follow-up if needed
        await this.scheduleFollowUp(callInfo.lead_id, call);
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
   * Handle transcript updates
   */
  private async handleTranscript(data: any): Promise<void> {
    const { call, transcript } = data;
    
    if (!transcript) return;

    console.log(`📝 Transcript update for call ${call.id}`);

    // Store transcript chunk
    await this.storeTranscriptChunk(call.id, transcript);

    // Get call info
    const callInfo = await this.getCallInfo(call.id);
    
    if (callInfo) {
      // Broadcast live transcript to WebSocket clients
      this.broadcastToClients('transcript_update', {
        call_id: call.id,
        campaign_id: callInfo.campaign_id,
        transcript: transcript,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle tool/function calls
   */
  private async handleToolCall(data: any): Promise<void> {
    const { call, tool } = data;
    
    console.log(`🛠️  Tool call for ${call.id}: ${tool.name}`);

    // Log tool usage
    await this.logToolUsage(call.id, tool);

    // Handle specific tools
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

  /**
   * Handle speech updates (real-time)
   */
  private async handleSpeechUpdate(data: any): Promise<void> {
    const { call } = data;
    
    // Get call info
    const callInfo = await this.getCallInfo(call.id);
    
    if (callInfo) {
      // Broadcast speech update to WebSocket clients
      this.broadcastToClients('speech_update', {
        call_id: call.id,
        campaign_id: callInfo.campaign_id,
        speech_data: data
      });
    }
  }

  /**
   * Handle call hang up
   */
  private async handleHang(data: any): Promise<void> {
    const { call } = data;
    
    console.log(`📞 Call hung up: ${call.id}`);

    // This is typically handled by call-end, but we can update status immediately
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        UPDATE vapi_call_attempts 
        SET status = 'completed'
        WHERE vapi_call_id = $1
      `, [call.id]);
    } finally {
      client.release();
    }
  }

  /**
   * Handle errors
   */
  private async handleError(data: any): Promise<void> {
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

      // Get call info
      const callInfo = await this.getCallInfo(call.id);
      
      if (callInfo) {
        // Broadcast error to WebSocket clients
        this.broadcastToClients('call_error', {
          call_id: call.id,
          campaign_id: callInfo.campaign_id,
          error: error
        });
      }
    } finally {
      client.release();
    }
  }

  /**
   * Verify webhook signature
   */
  private verifySignature(payload: VapiWebhookPayload, signature: string): boolean {
    if (!signature) return false;

    try {
      const hmac = crypto.createHmac('sha256', this.webhookSecret);
      hmac.update(JSON.stringify(payload));
      const expectedSignature = 'sha256=' + hmac.digest('hex');
      
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Get call information from database
   */
  private async getCallInfo(vapiCallId: string): Promise<{
    campaign_id: string;
    lead_id: string;
    lead_name: string;
    phone_number: string;
    account_id: string;
  } | null> {
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
    } finally {
      client.release();
    }
  }

  /**
   * Map VAPI status to internal status
   */
  private mapVapiStatusToInternal(vapiStatus: string): string {
    const statusMap: Record<string, string> = {
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

  /**
   * Store transcript chunk
   */
  private async storeTranscriptChunk(callId: string, transcript: VapiTranscript): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      // Get or create transcript record
      const existingResult = await client.query(`
        SELECT id FROM vapi_call_transcripts 
        WHERE vapi_call_id = $1
      `, [callId]);

      if (existingResult.rows.length === 0) {
        // Create new transcript record
        await client.query(`
          INSERT INTO vapi_call_transcripts (
            call_attempt_id, vapi_call_id, transcript, created_at
          ) VALUES (
            (SELECT id FROM vapi_call_attempts WHERE vapi_call_id = $1),
            $1, $2, NOW()
          )
        `, [callId, JSON.stringify([transcript])]);
      } else {
        // Append to existing transcript
        await client.query(`
          UPDATE vapi_call_transcripts 
          SET transcript = transcript || $2
          WHERE vapi_call_id = $1
        `, [callId, JSON.stringify([transcript])]);
      }
    } finally {
      client.release();
    }
  }

  /**
   * Update lead status based on call outcome
   */
  private async updateLeadStatus(leadId: string, call: VapiCall): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      let newStatus = 'contacted';
      let nextCallAt: Date | null = null;

      // Determine status based on call outcome
      if (call.endedReason) {
        switch (call.endedReason.toLowerCase()) {
          case 'customer_ended_call':
            newStatus = 'contacted';
            break;
          case 'voicemail':
            newStatus = 'contacted';
            // Schedule retry in 3 days
            nextCallAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
            break;
          case 'no_answer':
            newStatus = 'contacted';
            // Schedule retry in 1 day
            nextCallAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            break;
          case 'busy':
            newStatus = 'contacted';
            // Schedule retry in 4 hours
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
    } finally {
      client.release();
    }
  }

  /**
   * Update campaign metrics
   */
  private async updateCampaignMetrics(
    campaignId: string, 
    eventType: string, 
    data?: any
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      // Update campaign performance metrics
      const metricsUpdate: any = {};
      
      if (eventType === 'call_started') {
        metricsUpdate.total_calls = 'performance_metrics->\'total_calls\'::int + 1';
      } else if (eventType === 'call_ended') {
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
    } finally {
      client.release();
    }
  }

  /**
   * Schedule follow-up based on call outcome
   */
  private async scheduleFollowUp(leadId: string, call: VapiCall): Promise<void> {
    // This would integrate with your scheduling system
    // For now, we'll just log the need for follow-up
    console.log(`📅 Schedule follow-up for lead ${leadId} based on call ${call.id}`);
  }

  /**
   * Log webhook event
   */
  private async logWebhookEvent(payload: VapiWebhookPayload): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        INSERT INTO webhook_logs (
          event_type, payload, status, created_at
        ) VALUES ($1, $2, $3, NOW())
      `, [payload.type, JSON.stringify(payload), 'processed']);
    } catch (error) {
      // Don't throw if logging fails
      console.error('Failed to log webhook event:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Log webhook error
   */
  private async logWebhookError(payload: VapiWebhookPayload, error: Error): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        INSERT INTO webhook_logs (
          event_type, payload, status, error_message, created_at
        ) VALUES ($1, $2, $3, $4, NOW())
      `, [payload.type, JSON.stringify(payload), 'failed', error.message]);
    } catch (logError) {
      console.error('Failed to log webhook error:', logError);
    } finally {
      client.release();
    }
  }

  /**
   * Log tool usage
   */
  private async logToolUsage(callId: string, tool: VapiTool): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        INSERT INTO tool_usage_logs (
          call_id, tool_name, parameters, result, created_at
        ) VALUES ($1, $2, $3, $4, NOW())
      `, [callId, tool.name, JSON.stringify(tool.parameters), JSON.stringify(tool.result)]);
    } catch (error) {
      console.error('Failed to log tool usage:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Handle schedule callback tool
   */
  private async handleScheduleCallback(callId: string, parameters: any): Promise<void> {
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
    } finally {
      client.release();
    }
  }

  /**
   * Handle transfer call tool
   */
  private async handleTransferCall(callId: string, parameters: any): Promise<void> {
    // Implement call transfer logic
    console.log(`📞 Transfer call ${callId} to ${parameters.transfer_to}`);
  }

  /**
   * Handle capture lead info tool
   */
  private async handleCaptureLeadInfo(callId: string, parameters: any): Promise<void> {
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
    } finally {
      client.release();
    }
  }

  /**
   * Handle set appointment tool
   */
  private async handleSetAppointment(callId: string, parameters: any): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const appointmentTime = new Date(parameters.appointment_time);
      
      // Update lead status to qualified and schedule appointment
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
    } finally {
      client.release();
    }
  }

  /**
   * WebSocket client management
   */
  addWebSocketClient(ws: WebSocket, accountId: string, campaignId?: string): string {
    const clientId = crypto.randomUUID();
    
    this.wsClients.set(clientId, {
      id: clientId,
      ws,
      accountId,
      campaignId,
      lastHeartbeat: new Date()
    });

    // Handle client disconnect
    ws.on('close', () => {
      this.wsClients.delete(clientId);
    });

    // Handle heartbeat
    ws.on('message', (data) => {
      const client = this.wsClients.get(clientId);
      if (client) {
        client.lastHeartbeat = new Date();
      }
    });

    return clientId;
  }

  /**
   * Broadcast to WebSocket clients
   */
  private broadcastToClients(eventType: string, data: any): void {
    const message = JSON.stringify({
      type: eventType,
      data,
      timestamp: new Date().toISOString()
    });

    this.wsClients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        // Filter by campaign if specified
        if (!data.campaign_id || !client.campaignId || client.campaignId === data.campaign_id) {
          client.ws.send(message);
        }
      }
    });
  }

  /**
   * Get webhook statistics
   */
  async getWebhookStats(): Promise<{
    total_webhooks: number;
    successful_webhooks: number;
    failed_webhooks: number;
    recent_errors: any[];
  }> {
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
    } finally {
      client.release();
    }
  }
}