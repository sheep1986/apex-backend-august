import axios, { AxiosInstance } from 'axios';
import supabase from './supabase-client';

interface VAPIConfig {
  apiKey: string;
  webhookSecret?: string;
  organizationId: string;
}

interface VAPIAssistant {
  id?: string;
  name: string;
  model?: {
    provider: 'openai' | 'anthropic' | 'google' | 'custom';
    model: string;
    temperature?: number;
    systemPrompt?: string;
  };
  voice?: {
    provider: 'elevenlabs' | 'deepgram' | 'cartesia' | 'azure' | 'lmnt' | 'openai';
    voiceId: string;
    stability?: number;
    similarityBoost?: number;
  };
  firstMessage?: string;
  endCallMessage?: string;
  transcriber?: {
    provider: 'deepgram' | 'assemblyai' | 'aws';
    language?: string;
    model?: string;
  };
  recordingEnabled?: boolean;
  endCallFunctionEnabled?: boolean;
  dialKeypadFunctionEnabled?: boolean;
  fillersEnabled?: boolean;
  serverUrl?: string;
  serverUrlSecret?: string;
}

interface QualificationField {
  field_key: string;
  field_name: string;
  field_type: string;
  ai_detection_hints: string[];
  scoring_weight: number;
  is_required: boolean;
  crm_action?: string;
}

interface VAPICall {
  id?: string;
  assistantId: string;
  phoneNumberId?: string;
  customer?: {
    number: string;
    name?: string;
    email?: string;
  };
  phoneNumber?: string;
  name?: string;
}

interface VAPICampaign {
  name: string;
  assistantId: string;
  phoneNumberId: string;
  customers: Array<{
    number: string;
    name?: string;
    email?: string;
    externalId?: string;
  }>;
  schedulePlan?: {
    startTime?: string;
    endTime?: string;
    timezone?: string;
    days?: string[];
  };
}

interface VAPICredentials {
  apiKey: string;
  privateKey: string;
  webhookUrl: string;
  enabled: boolean;
}

export class VAPIIntegrationService {
  private client: AxiosInstance;
  private config: VAPIConfig;

  constructor(config: VAPIConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: 'https://api.vapi.ai',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000, // 30 second timeout
      validateStatus: (status) => status < 500 // Accept any status < 500
    });
  }

  /**
   * Factory method to create VAPI service for a specific organization
   * Fetches organization-specific VAPI credentials from database
   */
  static async forOrganization(organizationId: string): Promise<VAPIIntegrationService | null> {
    try {
      
      // Primary: Check organizations table settings column
      console.log('🔄 Checking organizations table for VAPI credentials...');
      const { data: organization, error: orgError } = await supabase
        .from('organizations')
        .select('settings, vapi_api_key, vapi_private_key, vapi_settings')
        .eq('id', organizationId)
        .single();

      if (organization && !orgError) {
        // Try multiple locations for VAPI credentials
        let vapiSettings: any = null;
        
        // First, try the settings.vapi path
        if (organization.settings?.vapi) {
          vapiSettings = organization.settings.vapi;
          console.log('✅ Found VAPI credentials in organizations.settings.vapi');
        }
        // Then try the vapi_settings column
        else if (organization.vapi_settings) {
          try {
            vapiSettings = JSON.parse(organization.vapi_settings);
            console.log('✅ Found VAPI credentials in organizations.vapi_settings');
          } catch (parseError) {
            console.log('⚠️ Could not parse vapi_settings column');
          }
        }
        // Finally, try individual columns
        else if (organization.vapi_private_key || organization.vapi_api_key) {
          vapiSettings = {
            apiKey: organization.vapi_private_key || organization.vapi_api_key, // Use private key for API
            privateKey: organization.vapi_private_key || organization.vapi_api_key,
            publicKey: organization.vapi_api_key, // Public key stored in vapi_api_key
            webhookUrl: 'https://api.apexai.com/webhooks/vapi',
            enabled: true
          };
          console.log('✅ Found VAPI credentials in organizations columns - using vapi_private_key for API');
        }

        if (vapiSettings && vapiSettings.apiKey) {
          // Check if VAPI integration is enabled
          if (vapiSettings.enabled === false) {
            console.log('⚠️ VAPI integration is disabled for this organization');
            return null;
          }
          
          console.log('🎯 Creating VAPI service with credentials:', {
            hasApiKey: !!vapiSettings.apiKey,
            apiKeyPreview: vapiSettings.apiKey ? vapiSettings.apiKey.substring(0, 10) + '...' : 'NO KEY',
            organizationId,
            source: 'organizations table'
          });
          
          const config: VAPIConfig = {
            apiKey: vapiSettings.apiKey,
            organizationId,
            webhookSecret: vapiSettings.webhookUrl || 'https://api.apexai.com/webhooks/vapi'
          };
          
          return new VAPIIntegrationService(config);
        }
      }

      // Fallback to organization_settings table (legacy approach)
      console.log('🔄 Checking organization_settings for VAPI credentials...');
      
      const { data: settings, error: settingsError } = await supabase
        .from('organization_settings')
        .select('setting_value')
        .eq('organization_id', organizationId)
        .eq('setting_key', 'vapi_credentials')
        .single();

      if (settingsError || !settings) {
        console.log('⚠️ No VAPI credentials found for organization');
        return null;
      }

      const credentials = JSON.parse(settings.setting_value);
      
      if (!credentials.apiKey) {
        console.log('⚠️ Invalid VAPI credentials format');
        return null;
      }

      // Check if VAPI integration is enabled
      if (credentials.enabled === false) {
        console.log('⚠️ VAPI integration is disabled for this organization');
        return null;
      }

      console.log('✅ Found VAPI credentials in organization_settings');

      const config: VAPIConfig = {
        apiKey: credentials.apiKey,
        organizationId,
        webhookSecret: credentials.webhookSecret
      };

      return new VAPIIntegrationService(config);

    } catch (error) {
      console.error('❌ Error fetching VAPI credentials:', error);
      return null;
    }
  }

  /**
   * Get organization VAPI configuration details
   */
  static async getOrganizationVAPIConfig(organizationId: string): Promise<any> {
    try {
      // Try organizations table first
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('vapi_api_key, vapi_assistant_id, vapi_phone_number_id, vapi_webhook_url, vapi_settings')
        .eq('id', organizationId)
        .single();

      if (!orgError && org?.vapi_api_key) {
        const settings = org.vapi_settings ? JSON.parse(org.vapi_settings) : {};
        return {
          hasCredentials: true,
          apiKey: org.vapi_api_key ? '***' + org.vapi_api_key.slice(-4) : null,
          assistantId: org.vapi_assistant_id,
          phoneNumberId: org.vapi_phone_number_id,
          webhookUrl: org.vapi_webhook_url,
          configuredAt: settings.configured_at,
          lastTested: settings.lastTested,
          testResults: settings.testResults
        };
      }

      // Fallback to organization_settings
      const { data: settings, error: settingsError } = await supabase
        .from('organization_settings')
        .select('setting_value, updated_at')
        .eq('organization_id', organizationId)
        .eq('setting_key', 'vapi_credentials')
        .single();

      if (settingsError || !settings) {
        return { hasCredentials: false };
      }

      const credentials = JSON.parse(settings.setting_value);
      
      return {
        hasCredentials: true,
        apiKey: credentials.apiKey ? '***' + credentials.apiKey.slice(-4) : null,
        configuredAt: credentials.configured_at,
        lastTested: credentials.lastTested,
        testResults: credentials.testResults,
        updatedAt: settings.updated_at
      };

    } catch (error) {
      console.error('Error fetching VAPI config:', error);
      return { hasCredentials: false, error: error.message };
    }
  }

  /**
   * Create a VAPI assistant
   */
  async createAssistant(assistant: VAPIAssistant): Promise<any> {
    try {
      const response = await this.client.post('/assistant', assistant);
      
      // Store in our database
      await supabase
        .from('vapi_assistants')
        .insert({
          organization_id: this.config.organizationId,
          vapi_assistant_id: response.data.id,
          name: assistant.name,
          type: 'outbound',
          config: assistant,
          voice_id: assistant.voice?.voiceId,
          first_message: assistant.firstMessage,
          system_prompt: assistant.model?.systemPrompt,
          is_active: true
        });

      return response.data;
    } catch (error) {
      console.error('Error creating VAPI assistant:', error);
      throw error;
    }
  }

  /**
   * Update a VAPI assistant
   */
  async updateAssistant(assistantId: string, updates: Partial<VAPIAssistant>): Promise<any> {
    try {
      const response = await this.client.patch(`/assistant/${assistantId}`, updates);
      
      // Update in our database
      await supabase
        .from('vapi_assistants')
        .update({
          config: updates,
          updated_at: new Date().toISOString()
        })
        .eq('vapi_assistant_id', assistantId)
        .eq('organization_id', this.config.organizationId);

      return response.data;
    } catch (error) {
      console.error('Error updating VAPI assistant:', error);
      throw error;
    }
  }

  /**
   * List assistants
   */
  async listAssistants(): Promise<any[]> {
    try {
      console.log('🔍 Making VAPI API call to list assistants...');
      console.log('🔑 Using API key:', this.config.apiKey ? this.config.apiKey.substring(0, 10) + '...' : 'NO KEY');
      console.log('📍 API Base URL:', this.client.defaults.baseURL);
      console.log('🔐 Auth Header:', this.client.defaults.headers['Authorization'] ? 'Bearer ***' : 'NO AUTH');
      
      // Try axios first
      try {
        const response = await this.client.get('/assistant');
        console.log('✅ VAPI assistants API response:', {
          status: response.status,
          dataLength: Array.isArray(response.data) ? response.data.length : 'not array',
          dataPreview: Array.isArray(response.data) ? `${response.data.length} assistants` : 'not array',
          rawData: response.data
        });
        
        // Log the actual response for debugging
        if (Array.isArray(response.data) && response.data.length === 0) {
          console.log('⚠️ VAPI returned empty assistants array');
          console.log('💡 This could mean:');
          console.log('   1. No assistants created in VAPI dashboard');
          console.log('   2. Using wrong API key (public vs private)');
          console.log('   3. Assistants are under a different account');
        }
        
        return response.data || [];
      } catch (axiosError: any) {
        console.error('⚠️ Axios request failed, trying native HTTPS...', axiosError.message);
        
        // Fallback to native HTTPS
        const https = require('https');
        return new Promise((resolve, reject) => {
          const options = {
            hostname: 'api.vapi.ai',
            port: 443,
            path: '/assistant',
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          };
          
          const req = https.request(options, (res: any) => {
            let data = '';
            res.on('data', (chunk: any) => data += chunk);
            res.on('end', () => {
              if (res.statusCode === 200) {
                try {
                  const assistants = JSON.parse(data);
                  console.log('✅ Native HTTPS success! Retrieved', assistants.length, 'assistants');
                  resolve(assistants);
                } catch (e) {
                  reject(new Error('Failed to parse response'));
                }
              } else {
                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
              }
            });
          });
          
          req.on('error', (error: any) => {
            console.error('❌ Native HTTPS also failed:', error.message);
            reject(error);
          });
          
          req.end();
        });
      }
    } catch (error: any) {
      console.error('❌ Error listing VAPI assistants:', error.message);
      throw error;
    }
  }

  /**
   * Delete an assistant
   */
  async deleteAssistant(assistantId: string): Promise<void> {
    try {
      await this.client.delete(`/assistant/${assistantId}`);
      
      // Mark as inactive in our database
      await supabase
        .from('vapi_assistants')
        .update({ is_active: false })
        .eq('vapi_assistant_id', assistantId)
        .eq('organization_id', this.config.organizationId);
    } catch (error) {
      console.error('Error deleting VAPI assistant:', error);
      throw error;
    }
  }

  /**
   * Create an outbound call
   */
  async createCall(call: VAPICall): Promise<any> {
    try {
      const response = await this.client.post('/call', call);
      
      // Store call record
      await supabase
        .from('calls')
        .insert({
          organization_id: this.config.organizationId,
          vapi_call_id: response.data.id,
          to_number: call.phoneNumber || call.customer?.number,
          direction: 'outbound',
          status: 'queued',
          started_at: new Date().toISOString()
        });

      return response.data;
    } catch (error) {
      console.error('Error creating VAPI call:', error);
      throw error;
    }
  }

  /**
   * Get call details
   */
  async getCall(callId: string): Promise<any> {
    try {
      const response = await this.client.get(`/call/${callId}`);
      return response.data;
    } catch (error) {
      console.error('Error getting VAPI call:', error);
      throw error;
    }
  }

  /**
   * List calls with filters
   */
  async listCalls(filters?: {
    assistantId?: string;
    phoneNumberId?: string;
    limit?: number;
    createdAtGt?: string;
    createdAtLt?: string;
  }): Promise<any[]> {
    try {
      const response = await this.client.get('/call', { params: filters });
      return response.data;
    } catch (error) {
      console.error('Error listing VAPI calls:', error);
      throw error;
    }
  }

  /**
   * Create a campaign
   */
  async createCampaign(campaign: VAPICampaign): Promise<any> {
    try {
      const response = await this.client.post('/campaign', campaign);
      
      // Store campaign
      await supabase
        .from('campaigns')
        .insert({
          organization_id: this.config.organizationId,
          name: campaign.name,
          type: 'outbound',
          status: 'active',
          assistant_id: campaign.assistantId,
          phone_number_id: campaign.phoneNumberId,
          settings: {
            customers: campaign.customers,
            schedule: campaign.schedulePlan
          }
        });

      return response.data;
    } catch (error) {
      console.error('Error creating VAPI campaign:', error);
      throw error;
    }
  }

  /**
   * Handle VAPI webhooks
   */
  async handleWebhook(payload: any): Promise<void> {
    const { type, call, assistant, phoneNumber } = payload;

    switch (type) {
      case 'call-started':
        await this.handleCallStarted(call);
        break;
      
      case 'call-ended':
        await this.handleCallEnded(call);
        break;
      
      case 'speech-update':
        await this.handleSpeechUpdate(call, payload);
        break;
      
      case 'function-call':
        await this.handleFunctionCall(call, payload);
        break;
      
      case 'hang':
        await this.handleHang(call);
        break;
      
      case 'transfer-destination-request':
        return this.handleTransferRequest(call, payload);
      
      default:
        console.log('Unhandled webhook type:', type);
    }
  }

  /**
   * Handle call started webhook
   */
  private async handleCallStarted(call: any): Promise<void> {
    await supabase
      .from('calls')
      .update({
        status: 'in-progress',
        started_at: call.startedAt
      })
      .eq('vapi_call_id', call.id);
  }

  /**
   * Handle call ended webhook
   */
  private async handleCallEnded(call: any): Promise<void> {
    const { id, endedAt, duration, endedReason, cost, transcript, summary } = call;

    await supabase
      .from('calls')
      .update({
        status: 'completed',
        ended_at: endedAt,
        duration,
        end_reason: endedReason,
        cost,
        transcript,
        summary
      })
      .eq('vapi_call_id', id);

    // Update campaign metrics if part of a campaign
    if (call.campaignId) {
      await supabase.rpc('increment_campaign_metrics', {
        campaign_id: call.campaignId,
        calls: 1,
        duration: duration,
        successful: endedReason === 'hangup' ? 1 : 0
      });
    }
  }

  /**
   * Handle speech update webhook
   */
  private async handleSpeechUpdate(call: any, payload: any): Promise<void> {
    const { role, message, transcript } = payload;
    
    // Store conversation turns for analysis
    await supabase
      .from('call_transcripts')
      .insert({
        call_id: call.id,
        role,
        message,
        transcript,
        timestamp: new Date().toISOString()
      });
  }

  /**
   * Handle function call webhook
   */
  private async handleFunctionCall(call: any, payload: any): Promise<any> {
    const { functionCall } = payload;
    
    // Handle different function types
    switch (functionCall.name) {
      case 'transferCall':
        return this.handleTransferCall(call, functionCall.parameters);
      
      case 'endCall':
        return { status: 'ok' };
      
      case 'bookAppointment':
        return this.handleBookAppointment(call, functionCall.parameters);
      
      default:
        console.log('Unhandled function call:', functionCall.name);
        return { error: 'Function not implemented' };
    }
  }

  /**
   * Handle call hang webhook
   */
  private async handleHang(call: any): Promise<void> {
    await supabase
      .from('calls')
      .update({
        status: 'hung-up',
        ended_at: new Date().toISOString()
      })
      .eq('vapi_call_id', call.id);
  }

  /**
   * Handle transfer request
   */
  private async handleTransferRequest(call: any, payload: any): Promise<any> {
    // Logic to determine transfer destination
    return {
      destination: {
        type: 'number',
        number: '+1234567890' // Replace with actual transfer logic
      }
    };
  }

  /**
   * Handle transfer call function
   */
  private async handleTransferCall(call: any, parameters: any): Promise<any> {
    // Implement transfer logic
    return {
      status: 'transferred',
      destination: parameters.destination
    };
  }

  /**
   * Handle book appointment function
   */
  private async handleBookAppointment(call: any, parameters: any): Promise<any> {
    // Implement appointment booking logic
    const { date, time, name, reason } = parameters;
    
    // Store appointment
    await supabase
      .from('appointments')
      .insert({
        call_id: call.id,
        date,
        time,
        name,
        reason,
        created_at: new Date().toISOString()
      });

    return {
      status: 'booked',
      confirmationNumber: `APT-${Date.now()}`
    };
  }

  /**
   * Get phone numbers
   */
  async getPhoneNumbers(): Promise<any[]> {
    try {
      console.log('🔍 Making VAPI API call to list phone numbers...');
      console.log('🔑 Using API key:', this.config.apiKey ? this.config.apiKey.substring(0, 10) + '...' : 'NO KEY');
      console.log('📍 API Base URL:', this.client.defaults.baseURL);
      console.log('🔐 Auth Header:', this.client.defaults.headers['Authorization'] ? 'Bearer ***' : 'NO AUTH');
      
      // Try axios first
      try {
        const response = await this.client.get('/phone-number');
        console.log('✅ VAPI phone numbers API response:', {
          status: response.status,
          dataLength: Array.isArray(response.data) ? response.data.length : 'not array',
          dataPreview: Array.isArray(response.data) ? `${response.data.length} phone numbers` : 'not array',
          rawData: response.data
        });
        
        // Log the actual response for debugging
        if (Array.isArray(response.data) && response.data.length === 0) {
          console.log('⚠️ VAPI returned empty phone numbers array');
          console.log('💡 This could mean:');
          console.log('   1. No phone numbers purchased in VAPI dashboard');
          console.log('   2. Using wrong API key (public vs private)');
          console.log('   3. Phone numbers are under a different account');
        }
        
        return response.data || [];
      } catch (axiosError: any) {
        console.error('⚠️ Axios request failed, trying native HTTPS...', axiosError.message);
        
        // Fallback to native HTTPS
        const https = require('https');
        return new Promise((resolve, reject) => {
          const options = {
            hostname: 'api.vapi.ai',
            port: 443,
            path: '/phone-number',
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          };
          
          const req = https.request(options, (res: any) => {
            let data = '';
            res.on('data', (chunk: any) => data += chunk);
            res.on('end', () => {
              if (res.statusCode === 200) {
                try {
                  const phoneNumbers = JSON.parse(data);
                  console.log('✅ Native HTTPS success! Retrieved', phoneNumbers.length, 'phone numbers');
                  resolve(phoneNumbers);
                } catch (e) {
                  reject(new Error('Failed to parse response'));
                }
              } else {
                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
              }
            });
          });
          
          req.on('error', (error: any) => {
            console.error('❌ Native HTTPS also failed:', error.message);
            reject(error);
          });
          
          req.end();
        });
      }
    } catch (error: any) {
      console.error('❌ Error getting phone numbers:', error.message);
      throw error;
    }
  }

  /**
   * Buy a phone number
   */
  async buyPhoneNumber(areaCode: string, name?: string): Promise<any> {
    try {
      const response = await this.client.post('/phone-numbers/buy', {
        areaCode,
        name
      });
      return response.data;
    } catch (error) {
      console.error('Error buying phone number:', error);
      throw error;
    }
  }

  /**
   * Create a workflow (for complex call flows)
   */
  async createWorkflow(workflow: any): Promise<any> {
    try {
      const response = await this.client.post('/workflow', workflow);
      return response.data;
    } catch (error) {
      console.error('Error creating workflow:', error);
      throw error;
    }
  }

  /**
   * Get analytics for calls
   */
  async getAnalytics(filters: {
    startDate: string;
    endDate: string;
    assistantId?: string;
  }): Promise<any> {
    try {
      const { data: calls } = await supabase
        .from('calls')
        .select('*')
        .eq('organization_id', this.config.organizationId)
        .gte('started_at', filters.startDate)
        .lte('started_at', filters.endDate);

      // Calculate analytics
      const totalCalls = calls?.length || 0;
      const totalDuration = calls?.reduce((sum, call) => sum + (call.duration || 0), 0) || 0;
      const avgDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;
      const completedCalls = calls?.filter(c => c.status === 'completed').length || 0;
      const completionRate = totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 0;

      return {
        totalCalls,
        totalDuration,
        avgDuration,
        completedCalls,
        completionRate,
        costTotal: calls?.reduce((sum, call) => sum + (call.cost || 0), 0) || 0
      };
    } catch (error) {
      console.error('Error getting analytics:', error);
      throw error;
    }
  }

  /**
   * Generate optimized script based on qualification fields
   */
  async generateQualificationScript(
    campaignName: string,
    qualificationFields: QualificationField[],
    winningCriteria: any
  ): Promise<{ systemPrompt: string; firstMessage: string }> {
    const requiredFields = qualificationFields.filter(f => f.is_required);
    const highValueFields = qualificationFields.filter(f => f.scoring_weight >= 70);

    // Generate system prompt
    let systemPrompt = `You are a professional sales representative for ${campaignName}. Your goal is to qualify leads based on specific criteria while maintaining a natural, friendly conversation.

MAIN OBJECTIVE: ${winningCriteria.mainCriteria || 'Qualify leads for our solution'}

QUALIFICATION CRITERIA:`;

    // Add required fields
    if (requiredFields.length > 0) {
      systemPrompt += '\n\nREQUIRED INFORMATION (Must capture):';
      requiredFields.forEach(field => {
        systemPrompt += `\n- ${field.field_name}: Listen for ${field.ai_detection_hints.slice(0, 3).join(', ')}`;
      });
    }

    // Add high-value fields
    if (highValueFields.length > 0) {
      systemPrompt += '\n\nHIGH PRIORITY (Try to capture):';
      highValueFields.forEach(field => {
        systemPrompt += `\n- ${field.field_name} (${field.scoring_weight}% importance)`;
      });
    }

    // Add specific requirements
    if (winningCriteria.requireCompanySize) {
      systemPrompt += `\n\nCOMPANY SIZE: Must have at least ${winningCriteria.minCompanySize} employees`;
    }

    if (winningCriteria.requireBudget) {
      systemPrompt += '\n\nBUDGET: Explore their budget for this type of solution';
    }

    // Add disqualifiers
    if (winningCriteria.disqualifiers) {
      systemPrompt += `\n\nDISQUALIFIERS (End call politely if detected):\n${winningCriteria.disqualifiers}`;
    }

    // Add conversation guidelines
    systemPrompt += `

CONVERSATION GUIDELINES:
1. Be conversational and natural - this is not an interrogation
2. Ask open-ended questions to gather information organically
3. Listen actively and probe deeper on interesting points
4. If they show high interest, try to book a meeting
5. Keep the conversation under ${winningCriteria.minDuration || 3} minutes unless highly engaged
6. Always be respectful and professional

IMPORTANT: Capture specific details when mentioned, especially numbers, dates, and names.`;

    // Generate first message
    const firstMessageOptions = [
      `Hi! This is {assistant_name} from ${campaignName}. I'm reaching out because ${winningCriteria.mainCriteria}. Do you have a quick moment?`,
      `Hello! I'm {assistant_name} calling from ${campaignName}. We help businesses like yours ${winningCriteria.mainCriteria}. Is this a good time to chat for a minute?`,
      `Hi there! {assistant_name} here from ${campaignName}. I'm calling because ${winningCriteria.mainCriteria}. Can I ask you a quick question?`
    ];

    const firstMessage = firstMessageOptions[Math.floor(Math.random() * firstMessageOptions.length)];

    return { systemPrompt, firstMessage };
  }

  /**
   * Update assistant with qualification-based script
   */
  async updateAssistantWithQualification(
    assistantId: string,
    campaignName: string,
    qualificationFields: QualificationField[],
    winningCriteria: any
  ): Promise<any> {
    try {
      const { systemPrompt, firstMessage } = await this.generateQualificationScript(
        campaignName,
        qualificationFields,
        winningCriteria
      );

      const updateData = {
        model: {
          provider: 'openai',
          model: 'gpt-4',
          systemPrompt
        },
        firstMessage,
        recordingEnabled: true,
        endCallFunctionEnabled: true
      };

      const response = await this.client.patch(`/assistant/${assistantId}`, updateData);
      
      console.log('✅ Updated assistant with qualification script');
      return response.data;
    } catch (error) {
      console.error('Error updating assistant with qualification:', error);
      throw error;
    }
  }

  /**
   * Analyze assistant script coverage of qualification fields
   */
  async analyzeScriptCoverage(
    assistantId: string,
    qualificationFields: QualificationField[]
  ): Promise<{
    coveredFields: string[];
    missingFields: string[];
    coverageScore: number;
    recommendations: string[];
  }> {
    try {
      // Get assistant details
      const response = await this.client.get(`/assistant/${assistantId}`);
      const assistant = response.data;
      const systemPrompt = assistant.model?.systemPrompt || '';
      
      const coveredFields: string[] = [];
      const missingFields: string[] = [];
      const recommendations: string[] = [];

      // Check each field for coverage
      qualificationFields.forEach(field => {
        const hints = field.ai_detection_hints || [];
        const isCovered = hints.some(hint => 
          systemPrompt.toLowerCase().includes(hint.toLowerCase())
        );

        if (isCovered) {
          coveredFields.push(field.field_key);
        } else {
          missingFields.push(field.field_key);
          
          if (field.is_required) {
            recommendations.push(
              `Add questions about ${field.field_name} - this is a required field`
            );
          } else if (field.scoring_weight >= 70) {
            recommendations.push(
              `Consider adding ${field.field_name} questions - high scoring field (${field.scoring_weight}%)`
            );
          }
        }
      });

      const coverageScore = (coveredFields.length / qualificationFields.length) * 100;

      return {
        coveredFields,
        missingFields,
        coverageScore: Math.round(coverageScore),
        recommendations
      };
    } catch (error) {
      console.error('Error analyzing script coverage:', error);
      throw error;
    }
  }

  /**
   * Get assistant details
   */
  async getAssistant(assistantId: string): Promise<VAPIAssistant> {
    try {
      const response = await this.client.get(`/assistant/${assistantId}`);
      return response.data;
    } catch (error) {
      console.error('Error getting assistant:', error);
      throw error;
    }
  }

  async getVAPICredentials(organizationId: string): Promise<VAPICredentials | null> {
    try {
      console.log('🔍 Fetching VAPI credentials for organization:', organizationId);

      // Primary: Check organizations table settings column
      console.log('🔄 Checking organizations table for VAPI credentials...');
      const { data: organization, error: orgError } = await supabase
        .from('organizations')
        .select('settings, vapi_api_key, vapi_private_key, vapi_settings')
        .eq('id', organizationId)
        .single();

      if (organization && !orgError) {
        // Try multiple locations for VAPI credentials
        let vapiSettings: any = null;
        
        // First, try the settings.vapi path
        if (organization.settings?.vapi) {
          vapiSettings = organization.settings.vapi;
          console.log('✅ Found VAPI credentials in organizations.settings.vapi');
        }
        // Then try the vapi_settings column
        else if (organization.vapi_settings) {
          try {
            vapiSettings = JSON.parse(organization.vapi_settings);
            console.log('✅ Found VAPI credentials in organizations.vapi_settings');
          } catch (parseError) {
            console.log('⚠️ Could not parse vapi_settings column');
          }
        }
        // Finally, try individual columns
        else if (organization.vapi_private_key || organization.vapi_api_key) {
          vapiSettings = {
            apiKey: organization.vapi_private_key || organization.vapi_api_key, // Use private key for API
            privateKey: organization.vapi_private_key || organization.vapi_api_key,
            publicKey: organization.vapi_api_key, // Public key stored in vapi_api_key
            webhookUrl: 'https://api.apexai.com/webhooks/vapi',
            enabled: true
          };
          console.log('✅ Found VAPI credentials in organizations columns - using vapi_private_key for API');
        }

        if (vapiSettings && vapiSettings.apiKey) {
          return {
            apiKey: vapiSettings.apiKey,
            privateKey: vapiSettings.privateKey || vapiSettings.apiKey,
            webhookUrl: vapiSettings.webhookUrl || 'https://api.apexai.com/webhooks/vapi',
            enabled: vapiSettings.enabled !== undefined ? vapiSettings.enabled : true
          };
        }
      }

      // Fallback: Check organization_settings table (legacy approach)
      console.log('🔄 Checking organization_settings for VAPI credentials...');
      const { data: settings, error: settingsError } = await supabase
        .from('organization_settings')
        .select('setting_value')
        .eq('organization_id', organizationId)
        .eq('setting_key', 'vapi_credentials')
        .single();

      if (settings && !settingsError) {
        try {
          const credentials = JSON.parse(settings.setting_value);
          console.log('✅ Found VAPI credentials in organization_settings');
          return {
            apiKey: credentials.apiKey,
            privateKey: credentials.privateKey || credentials.apiKey,
            webhookUrl: credentials.webhookUrl || 'https://api.apexai.com/webhooks/vapi',
            enabled: credentials.enabled !== undefined ? credentials.enabled : true
          };
        } catch (parseError) {
          console.log('⚠️ Could not parse organization_settings VAPI credentials');
        }
      }

      console.log('⚠️ No VAPI credentials found for organization');
      return null;
    } catch (error) {
      console.error('❌ Error fetching VAPI credentials:', error);
      return null;
    }
  }
} 