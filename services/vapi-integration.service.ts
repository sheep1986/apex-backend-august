import { Pool } from 'pg';
import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';

interface VapiConfig {
  apiKey: string;
  baseUrl: string;
  webhookSecret: string;
}

interface VapiAssistant {
  id: string;
  name: string;
  model: {
    provider: string;
    model: string;
    temperature: number;
    systemMessage: string;
  };
  voice: {
    provider: string;
    voiceId: string;
  };
  firstMessage: string;
  tools?: VapiTool[];
  serverUrl?: string;
}

interface VapiTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, any>;
      required: string[];
    };
  };
}

interface VapiPhoneNumber {
  id: string;
  number: string;
  provider: string;
  providerAccountId: string;
  providerApplicationId: string;
  name: string;
  assistantId?: string;
}

interface VapiCall {
  id: string;
  assistantId: string;
  phoneNumberId: string;
  customer: {
    number: string;
    name?: string;
  };
  status: string;
  type: 'inbound' | 'outbound';
  cost?: number;
  duration?: number;
  startedAt?: string;
  endedAt?: string;
  transcript?: string;
  recordingUrl?: string;
  summary?: string;
}

interface CallRequest {
  assistantId: string;
  phoneNumberId: string;
  customer: {
    number: string;
    name?: string;
  };
  metadata?: Record<string, any>;
}

export class VapiIntegrationService extends EventEmitter {
  private pool: Pool;
  private client: AxiosInstance;
  private config: VapiConfig;

  constructor(pool: Pool, config?: Partial<VapiConfig>) {
    super();
    this.pool = pool;
    
    this.config = {
      apiKey: config?.apiKey || process.env.VAPI_API_KEY || '',
      baseUrl: config?.baseUrl || 'https://api.vapi.ai',
      webhookSecret: config?.webhookSecret || process.env.VAPI_WEBHOOK_SECRET || ''
    };

    // Initialize HTTP client
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Set up request/response interceptors
    this.setupInterceptors();
  }

  /**
   * Set up HTTP interceptors for logging and error handling
   */
  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (config) => {
        console.log(`📡 VAPI Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('VAPI Request Error:', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        console.log(`✅ VAPI Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error('VAPI Response Error:', error.response?.status, error.response?.data);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Create a new VAPI assistant
   */
  async createAssistant(assistant: Omit<VapiAssistant, 'id'>): Promise<VapiAssistant> {
    try {
      const response = await this.client.post('/assistant', assistant);
      
      const createdAssistant = response.data;
      
      // Store assistant in database
      await this.storeAssistant(createdAssistant);
      
      this.emit('assistant_created', createdAssistant);
      
      return createdAssistant;
      
    } catch (error) {
      console.error('Failed to create VAPI assistant:', error);
      throw new Error(`Assistant creation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Update an existing VAPI assistant
   */
  async updateAssistant(assistantId: string, updates: Partial<VapiAssistant>): Promise<VapiAssistant> {
    try {
      const response = await this.client.patch(`/assistant/${assistantId}`, updates);
      
      const updatedAssistant = response.data;
      
      // Update assistant in database
      await this.updateStoredAssistant(assistantId, updatedAssistant);
      
      this.emit('assistant_updated', updatedAssistant);
      
      return updatedAssistant;
      
    } catch (error) {
      console.error('Failed to update VAPI assistant:', error);
      throw new Error(`Assistant update failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get VAPI assistant details
   */
  async getAssistant(assistantId: string): Promise<VapiAssistant> {
    try {
      const response = await this.client.get(`/assistant/${assistantId}`);
      return response.data;
      
    } catch (error) {
      console.error('Failed to get VAPI assistant:', error);
      throw new Error(`Assistant retrieval failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * List all VAPI assistants
   */
  async listAssistants(): Promise<VapiAssistant[]> {
    try {
      const response = await this.client.get('/assistant');
      return response.data;
      
    } catch (error) {
      console.error('Failed to list VAPI assistants:', error);
      throw new Error(`Assistant listing failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Delete a VAPI assistant
   */
  async deleteAssistant(assistantId: string): Promise<void> {
    try {
      await this.client.delete(`/assistant/${assistantId}`);
      
      // Remove from database
      await this.removeStoredAssistant(assistantId);
      
      this.emit('assistant_deleted', { id: assistantId });
      
    } catch (error) {
      console.error('Failed to delete VAPI assistant:', error);
      throw new Error(`Assistant deletion failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Purchase a phone number
   */
  async purchasePhoneNumber(areaCode: string, name: string): Promise<VapiPhoneNumber> {
    try {
      const response = await this.client.post('/phone-number', {
        areaCode,
        name
      });
      
      const phoneNumber = response.data;
      
      // Store phone number in database
      await this.storePhoneNumber(phoneNumber);
      
      this.emit('phone_number_purchased', phoneNumber);
      
      return phoneNumber;
      
    } catch (error) {
      console.error('Failed to purchase phone number:', error);
      throw new Error(`Phone number purchase failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * List phone numbers
   */
  async listPhoneNumbers(): Promise<VapiPhoneNumber[]> {
    try {
      const response = await this.client.get('/phone-number');
      return response.data;
      
    } catch (error) {
      console.error('Failed to list phone numbers:', error);
      throw new Error(`Phone number listing failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Update phone number configuration
   */
  async updatePhoneNumber(phoneNumberId: string, updates: Partial<VapiPhoneNumber>): Promise<VapiPhoneNumber> {
    try {
      const response = await this.client.patch(`/phone-number/${phoneNumberId}`, updates);
      
      const updatedPhoneNumber = response.data;
      
      // Update in database
      await this.updateStoredPhoneNumber(phoneNumberId, updatedPhoneNumber);
      
      this.emit('phone_number_updated', updatedPhoneNumber);
      
      return updatedPhoneNumber;
      
    } catch (error) {
      console.error('Failed to update phone number:', error);
      throw new Error(`Phone number update failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Make an outbound call
   */
  async makeCall(request: CallRequest): Promise<VapiCall> {
    try {
      console.log(`📞 Making outbound call to ${request.customer.number}`);
      
      const response = await this.client.post('/call', request);
      
      const call = response.data;
      
      // Store call in database
      await this.storeCall(call);
      
      this.emit('call_initiated', call);
      
      return call;
      
    } catch (error) {
      console.error('Failed to make VAPI call:', error);
      throw new Error(`Call initiation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get call details
   */
  async getCall(callId: string): Promise<VapiCall> {
    try {
      const response = await this.client.get(`/call/${callId}`);
      return response.data;
      
    } catch (error) {
      console.error('Failed to get call details:', error);
      throw new Error(`Call retrieval failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * List calls with filters
   */
  async listCalls(filters?: {
    assistantId?: string;
    phoneNumberId?: string;
    status?: string;
    type?: string;
    limit?: number;
    offset?: number;
  }): Promise<VapiCall[]> {
    try {
      const params = new URLSearchParams();
      
      if (filters?.assistantId) params.append('assistantId', filters.assistantId);
      if (filters?.phoneNumberId) params.append('phoneNumberId', filters.phoneNumberId);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.type) params.append('type', filters.type);
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.offset) params.append('offset', filters.offset.toString());
      
      const response = await this.client.get(`/call?${params.toString()}`);
      return response.data;
      
    } catch (error) {
      console.error('Failed to list calls:', error);
      throw new Error(`Call listing failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * End an active call
   */
  async endCall(callId: string): Promise<void> {
    try {
      await this.client.delete(`/call/${callId}`);
      
      this.emit('call_ended', { id: callId });
      
    } catch (error) {
      console.error('Failed to end call:', error);
      throw new Error(`Call termination failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get call analytics
   */
  async getCallAnalytics(filters?: {
    startDate?: string;
    endDate?: string;
    assistantId?: string;
    phoneNumberId?: string;
  }): Promise<{
    totalCalls: number;
    totalDuration: number;
    totalCost: number;
    averageDuration: number;
    successRate: number;
    callsByStatus: Record<string, number>;
    callsByHour: Array<{ hour: number; count: number }>;
  }> {
    try {
      const params = new URLSearchParams();
      
      if (filters?.startDate) params.append('startDate', filters.startDate);
      if (filters?.endDate) params.append('endDate', filters.endDate);
      if (filters?.assistantId) params.append('assistantId', filters.assistantId);
      if (filters?.phoneNumberId) params.append('phoneNumberId', filters.phoneNumberId);
      
      const response = await this.client.get(`/call/analytics?${params.toString()}`);
      return response.data;
      
    } catch (error) {
      console.error('Failed to get call analytics:', error);
      throw new Error(`Analytics retrieval failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Test VAPI connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/assistant');
      return response.status === 200;
      
    } catch (error) {
      console.error('VAPI connection test failed:', error);
      return false;
    }
  }

  /**
   * Create campaign-specific assistant
   */
  async createCampaignAssistant(
    campaignId: string,
    config: {
      name: string;
      script: string;
      voice: string;
      tools?: string[];
    }
  ): Promise<VapiAssistant> {
    const tools = this.buildCampaignTools(config.tools || []);
    
    const assistant = await this.createAssistant({
      name: config.name,
      model: {
        provider: 'openai',
        model: 'gpt-4-turbo-preview',
        temperature: 0.7,
        systemMessage: config.script
      },
      voice: {
        provider: '11labs',
        voiceId: config.voice
      },
      firstMessage: "Hello! I'm calling from your sales team. How are you today?",
      tools,
      serverUrl: process.env.VAPI_SERVER_URL
    });

    // Link assistant to campaign
    await this.linkAssistantToCampaign(assistant.id, campaignId);
    
    return assistant;
  }

  /**
   * Build campaign-specific tools
   */
  private buildCampaignTools(toolNames: string[]): VapiTool[] {
    const availableTools: Record<string, VapiTool> = {
      schedule_callback: {
        type: 'function',
        function: {
          name: 'schedule_callback',
          description: 'Schedule a callback with the prospect',
          parameters: {
            type: 'object',
            properties: {
              callback_time: {
                type: 'string',
                description: 'ISO 8601 datetime for the callback'
              },
              reason: {
                type: 'string',
                description: 'Reason for the callback'
              }
            },
            required: ['callback_time', 'reason']
          }
        }
      },
      
      capture_lead_info: {
        type: 'function',
        function: {
          name: 'capture_lead_info',
          description: 'Capture additional lead information',
          parameters: {
            type: 'object',
            properties: {
              company_size: {
                type: 'string',
                description: 'Size of the company'
              },
              industry: {
                type: 'string',
                description: 'Industry of the company'
              },
              budget: {
                type: 'string',
                description: 'Budget range mentioned'
              },
              timeline: {
                type: 'string',
                description: 'Implementation timeline'
              },
              pain_points: {
                type: 'array',
                items: { type: 'string' },
                description: 'Pain points mentioned'
              }
            },
            required: []
          }
        }
      },
      
      set_appointment: {
        type: 'function',
        function: {
          name: 'set_appointment',
          description: 'Set an appointment for demo or meeting',
          parameters: {
            type: 'object',
            properties: {
              appointment_time: {
                type: 'string',
                description: 'ISO 8601 datetime for the appointment'
              },
              appointment_type: {
                type: 'string',
                enum: ['demo', 'meeting', 'consultation'],
                description: 'Type of appointment'
              },
              duration: {
                type: 'number',
                description: 'Duration in minutes'
              }
            },
            required: ['appointment_time', 'appointment_type']
          }
        }
      },
      
      transfer_call: {
        type: 'function',
        function: {
          name: 'transfer_call',
          description: 'Transfer call to a human agent',
          parameters: {
            type: 'object',
            properties: {
              transfer_to: {
                type: 'string',
                description: 'Phone number or agent ID to transfer to'
              },
              reason: {
                type: 'string',
                description: 'Reason for transfer'
              }
            },
            required: ['transfer_to', 'reason']
          }
        }
      }
    };

    return toolNames
      .filter(name => availableTools[name])
      .map(name => availableTools[name]);
  }

  /**
   * Store assistant in database
   */
  private async storeAssistant(assistant: VapiAssistant): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        INSERT INTO vapi_assistants (
          vapi_assistant_id, name, model_config, voice_config, 
          first_message, tools, server_url, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (vapi_assistant_id) DO UPDATE SET
          name = EXCLUDED.name,
          model_config = EXCLUDED.model_config,
          voice_config = EXCLUDED.voice_config,
          first_message = EXCLUDED.first_message,
          tools = EXCLUDED.tools,
          server_url = EXCLUDED.server_url,
          updated_at = NOW()
      `, [
        assistant.id,
        assistant.name,
        JSON.stringify(assistant.model),
        JSON.stringify(assistant.voice),
        assistant.firstMessage,
        JSON.stringify(assistant.tools || []),
        assistant.serverUrl
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Update stored assistant
   */
  private async updateStoredAssistant(assistantId: string, assistant: VapiAssistant): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        UPDATE vapi_assistants 
        SET 
          name = $2,
          model_config = $3,
          voice_config = $4,
          first_message = $5,
          tools = $6,
          server_url = $7,
          updated_at = NOW()
        WHERE vapi_assistant_id = $1
      `, [
        assistantId,
        assistant.name,
        JSON.stringify(assistant.model),
        JSON.stringify(assistant.voice),
        assistant.firstMessage,
        JSON.stringify(assistant.tools || []),
        assistant.serverUrl
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Remove stored assistant
   */
  private async removeStoredAssistant(assistantId: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(
        'DELETE FROM vapi_assistants WHERE vapi_assistant_id = $1',
        [assistantId]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Store phone number in database
   */
  private async storePhoneNumber(phoneNumber: VapiPhoneNumber): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        INSERT INTO vapi_phone_numbers (
          vapi_phone_number_id, phone_number, provider, provider_account_id,
          provider_application_id, name, assistant_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (vapi_phone_number_id) DO UPDATE SET
          phone_number = EXCLUDED.phone_number,
          provider = EXCLUDED.provider,
          provider_account_id = EXCLUDED.provider_account_id,
          provider_application_id = EXCLUDED.provider_application_id,
          name = EXCLUDED.name,
          assistant_id = EXCLUDED.assistant_id,
          updated_at = NOW()
      `, [
        phoneNumber.id,
        phoneNumber.number,
        phoneNumber.provider,
        phoneNumber.providerAccountId,
        phoneNumber.providerApplicationId,
        phoneNumber.name,
        phoneNumber.assistantId
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Update stored phone number
   */
  private async updateStoredPhoneNumber(phoneNumberId: string, phoneNumber: VapiPhoneNumber): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        UPDATE vapi_phone_numbers 
        SET 
          phone_number = $2,
          provider = $3,
          provider_account_id = $4,
          provider_application_id = $5,
          name = $6,
          assistant_id = $7,
          updated_at = NOW()
        WHERE vapi_phone_number_id = $1
      `, [
        phoneNumberId,
        phoneNumber.number,
        phoneNumber.provider,
        phoneNumber.providerAccountId,
        phoneNumber.providerApplicationId,
        phoneNumber.name,
        phoneNumber.assistantId
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Store call in database
   */
  private async storeCall(call: VapiCall): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        INSERT INTO vapi_calls (
          vapi_call_id, assistant_id, phone_number_id, customer_number,
          customer_name, status, type, cost, duration, started_at,
          ended_at, transcript, recording_url, summary, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
        ON CONFLICT (vapi_call_id) DO UPDATE SET
          status = EXCLUDED.status,
          cost = EXCLUDED.cost,
          duration = EXCLUDED.duration,
          started_at = EXCLUDED.started_at,
          ended_at = EXCLUDED.ended_at,
          transcript = EXCLUDED.transcript,
          recording_url = EXCLUDED.recording_url,
          summary = EXCLUDED.summary,
          updated_at = NOW()
      `, [
        call.id,
        call.assistantId,
        call.phoneNumberId,
        call.customer.number,
        call.customer.name,
        call.status,
        call.type,
        call.cost,
        call.duration,
        call.startedAt,
        call.endedAt,
        call.transcript,
        call.recordingUrl,
        call.summary
      ]);
    } finally {
      client.release();
    }
  }

  /**
   * Link assistant to campaign
   */
  private async linkAssistantToCampaign(assistantId: string, campaignId: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        UPDATE campaigns 
        SET vapi_assistant_id = $1, updated_at = NOW()
        WHERE id = $2
      `, [assistantId, campaignId]);
    } finally {
      client.release();
    }
  }

  /**
   * Get VAPI service health
   */
  async getServiceHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    latency: number;
    errors: number;
    rate_limit: {
      remaining: number;
      reset: number;
    };
  }> {
    const startTime = Date.now();
    
    try {
      const response = await this.client.get('/assistant', {
        params: { limit: 1 }
      });
      
      const latency = Date.now() - startTime;
      
      return {
        status: 'healthy',
        latency,
        errors: 0,
        rate_limit: {
          remaining: parseInt(response.headers['x-ratelimit-remaining'] || '0'),
          reset: parseInt(response.headers['x-ratelimit-reset'] || '0')
        }
      };
      
    } catch (error) {
      const latency = Date.now() - startTime;
      
      return {
        status: 'unhealthy',
        latency,
        errors: 1,
        rate_limit: {
          remaining: 0,
          reset: 0
        }
      };
    }
  }

  /**
   * Get integration statistics
   */
  async getIntegrationStats(): Promise<{
    total_assistants: number;
    total_phone_numbers: number;
    total_calls: number;
    calls_today: number;
    calls_this_month: number;
    total_cost: number;
    average_call_duration: number;
    success_rate: number;
  }> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(`
        SELECT 
          (SELECT COUNT(*) FROM vapi_assistants) as total_assistants,
          (SELECT COUNT(*) FROM vapi_phone_numbers) as total_phone_numbers,
          (SELECT COUNT(*) FROM vapi_calls) as total_calls,
          (SELECT COUNT(*) FROM vapi_calls WHERE DATE(created_at) = CURRENT_DATE) as calls_today,
          (SELECT COUNT(*) FROM vapi_calls WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)) as calls_this_month,
          (SELECT COALESCE(SUM(cost), 0) FROM vapi_calls) as total_cost,
          (SELECT COALESCE(AVG(duration), 0) FROM vapi_calls WHERE duration > 0) as average_call_duration,
          (SELECT 
            CASE 
              WHEN COUNT(*) = 0 THEN 0 
              ELSE ROUND((COUNT(*) FILTER (WHERE status = 'completed')::float / COUNT(*) * 100), 2)
            END
          FROM vapi_calls) as success_rate
      `);
      
      const stats = result.rows[0];
      
      return {
        total_assistants: parseInt(stats.total_assistants),
        total_phone_numbers: parseInt(stats.total_phone_numbers),
        total_calls: parseInt(stats.total_calls),
        calls_today: parseInt(stats.calls_today),
        calls_this_month: parseInt(stats.calls_this_month),
        total_cost: parseFloat(stats.total_cost),
        average_call_duration: parseFloat(stats.average_call_duration),
        success_rate: parseFloat(stats.success_rate)
      };
      
    } finally {
      client.release();
    }
  }
}