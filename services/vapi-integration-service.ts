import axios, { AxiosInstance } from 'axios';
import supabase from './supabase-client';
import crypto from 'crypto';

interface VAPIConfig {
  apiKey: string;  // This should be the private key for API calls
  publicKey?: string;  // Public key for webhook verification
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
  publicKey: string;
  webhookUrl: string;
  enabled: boolean;
}

export class VAPIIntegrationService {
  private client: AxiosInstance;
  private config: VAPIConfig;

  constructor(config: VAPIConfig) {
    this.config = config;
    
    // Use private key for API authentication
    if (!config.apiKey) {
      throw new Error('VAPI private key is required for API authentication');
    }
    
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
   * IMPORTANT: Uses private key for API, public key for webhook verification
   */
  static async forOrganization(organizationId: string): Promise<VAPIIntegrationService | null> {
    try {
      console.log('🔄 Fetching VAPI credentials for organization:', organizationId);
      
      // Fetch from organizations table
      const { data: organization, error: orgError } = await supabase
        .from('organizations')
        .select('settings, vapi_public_key, vapi_api_key, vapi_private_key, vapi_settings, vapi_webhook_url')
        .eq('id', organizationId)
        .single();

      if (!organization || orgError) {
        console.log('⚠️ No organization found or error:', orgError);
        return null;
      }

      // Extract credentials with proper key usage
      let publicKey: string | null = null;
      let privateKey: string | null = null;
      let webhookUrl: string | null = null;
      
      // Priority 1: Use explicit columns (vapi_public_key and vapi_private_key)
      publicKey = organization.vapi_public_key || organization.vapi_api_key; // Fall back to vapi_api_key for backward compat
      privateKey = organization.vapi_private_key;
      webhookUrl = organization.vapi_webhook_url;
      
      // Priority 2: Check settings.vapi if columns are empty
      if (!privateKey && organization.settings?.vapi) {
        const vapiSettings = organization.settings.vapi;
        privateKey = vapiSettings.privateKey || vapiSettings.apiKey; // Some old records might have apiKey
        publicKey = publicKey || vapiSettings.publicKey || vapiSettings.apiKey;
        webhookUrl = webhookUrl || vapiSettings.webhookUrl;
      }
      
      // Priority 3: Check vapi_settings column (legacy)
      if (!privateKey && organization.vapi_settings) {
        try {
          const settings = typeof organization.vapi_settings === 'string' 
            ? JSON.parse(organization.vapi_settings) 
            : organization.vapi_settings;
          
          privateKey = privateKey || settings.privateKey || settings.apiKey;
          publicKey = publicKey || settings.publicKey;
          webhookUrl = webhookUrl || settings.webhookUrl;
          
          // Check if disabled
          if (settings.enabled === false) {
            console.log('⚠️ VAPI integration is disabled for this organization');
            return null;
          }
        } catch (parseError) {
          console.log('⚠️ Could not parse vapi_settings column:', parseError);
        }
      }
      
      // CRITICAL: Must have private key for API calls
      if (!privateKey) {
        console.log('⚠️ No VAPI private key found for organization');
        return null;
      }
      
      console.log('🎯 Creating VAPI service with credentials:', {
        hasPrivateKey: !!privateKey,
        privateKeyPreview: privateKey ? privateKey.substring(0, 10) + '...' : 'NO KEY',
        hasPublicKey: !!publicKey,
        publicKeyPreview: publicKey ? publicKey.substring(0, 10) + '...' : 'NO KEY',
        organizationId,
        webhookUrl: webhookUrl || 'default'
      });
      
      const config: VAPIConfig = {
        apiKey: privateKey, // Use private key for API authentication
        publicKey: publicKey || undefined, // Public key for webhook verification
        organizationId,
        webhookSecret: webhookUrl || `${process.env.BACKEND_URL}/api/vapi-webhook`
      };
      
      return new VAPIIntegrationService(config);

    } catch (error) {
      console.error('❌ Error creating VAPI service:', error);
      return null;
    }
  }

  /**
   * Get the public key for webhook signature verification
   */
  getPublicKey(): string | undefined {
    return this.config.publicKey;
  }

  /**
   * Verify webhook signature using the public key
   * @param payload Raw request body as string
   * @param signature X-Vapi-Signature header value
   * @returns true if signature is valid
   */
  static verifyWebhookSignature(payload: string, signature: string, publicKey: string): boolean {
    try {
      if (!publicKey) {
        console.warn('⚠️ No public key configured for webhook verification');
        return false;
      }

      // VAPI uses HMAC-SHA256 for webhook signatures
      const expectedSignature = crypto
        .createHmac('sha256', publicKey)
        .update(payload)
        .digest('hex');
      
      // Use timing-safe comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      console.error('❌ Webhook signature verification error:', error);
      return false;
    }
  }

  /**
   * Get organization VAPI configuration details (for display purposes)
   */
  static async getOrganizationVAPIConfig(organizationId: string): Promise<any> {
    try {
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('vapi_public_key, vapi_api_key, vapi_private_key, vapi_webhook_url, vapi_settings')
        .eq('id', organizationId)
        .single();

      if (!orgError && org) {
        const hasPublicKey = !!(org.vapi_public_key || org.vapi_api_key);
        const hasPrivateKey = !!org.vapi_private_key;
        
        return {
          hasCredentials: hasPublicKey && hasPrivateKey,
          hasPublicKey,
          hasPrivateKey,
          webhookUrl: org.vapi_webhook_url,
          // Never expose actual keys in config display
          publicKeyPreview: hasPublicKey ? '***configured***' : null,
          privateKeyPreview: hasPrivateKey ? '***configured***' : null
        };
      }

      return { hasCredentials: false, hasPublicKey: false, hasPrivateKey: false };

    } catch (error) {
      console.error('Error fetching VAPI config:', error);
      return { hasCredentials: false, error: error.message };
    }
  }

  /**
   * Test VAPI connection with current credentials
   */
  async testConnection(): Promise<{ connected: boolean; message: string; details?: any }> {
    try {
      console.log('🔌 Testing VAPI connection...');
      
      // Try to list assistants as a connection test
      const response = await this.client.get('/assistant', {
        params: { limit: 1 }
      });
      
      if (response.status === 200) {
        return {
          connected: true,
          message: 'Successfully connected to VAPI',
          details: {
            assistantCount: Array.isArray(response.data) ? response.data.length : 0
          }
        };
      }
      
      return {
        connected: false,
        message: `Unexpected response status: ${response.status}`
      };
      
    } catch (error: any) {
      console.error('❌ VAPI connection test failed:', error.message);
      
      if (error.response?.status === 401) {
        return {
          connected: false,
          message: 'Invalid API key - please check your VAPI private key'
        };
      }
      
      if (error.response?.status === 403) {
        return {
          connected: false,
          message: 'API key lacks required permissions'
        };
      }
      
      return {
        connected: false,
        message: error.message || 'Connection test failed'
      };
    }
  }

  /**
   * Sync VAPI assistants to local database
   */
  async syncAssistants(): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      console.log('🔄 Syncing VAPI assistants...');
      
      const assistants = await this.listAssistants();
      
      if (!Array.isArray(assistants)) {
        return { success: false, count: 0, error: 'Invalid response from VAPI' };
      }
      
      // Clear existing assistants for this organization
      await supabase
        .from('vapi_assistants')
        .delete()
        .eq('organization_id', this.config.organizationId);
      
      // Insert new assistants
      if (assistants.length > 0) {
        const assistantRecords = assistants.map(assistant => ({
          organization_id: this.config.organizationId,
          vapi_assistant_id: assistant.id,
          name: assistant.name,
          type: 'outbound',
          config: assistant,
          voice_id: assistant.voice?.voiceId,
          first_message: assistant.firstMessage,
          system_prompt: assistant.model?.systemPrompt,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));
        
        const { error: insertError } = await supabase
          .from('vapi_assistants')
          .insert(assistantRecords);
        
        if (insertError) {
          console.error('❌ Error inserting assistants:', insertError);
          return { success: false, count: 0, error: insertError.message };
        }
      }
      
      console.log(`✅ Synced ${assistants.length} assistants`);
      return { success: true, count: assistants.length };
      
    } catch (error: any) {
      console.error('❌ Error syncing assistants:', error);
      return { success: false, count: 0, error: error.message };
    }
  }

  /**
   * Sync VAPI phone numbers to local database
   */
  async syncPhoneNumbers(): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      console.log('🔄 Syncing VAPI phone numbers...');
      
      const phoneNumbers = await this.getPhoneNumbers();
      
      if (!Array.isArray(phoneNumbers)) {
        return { success: false, count: 0, error: 'Invalid response from VAPI' };
      }
      
      // Clear existing phone numbers for this organization
      await supabase
        .from('phone_numbers')
        .delete()
        .eq('organization_id', this.config.organizationId)
        .eq('provider', 'vapi');
      
      // Insert new phone numbers
      if (phoneNumbers.length > 0) {
        const phoneRecords = phoneNumbers.map(phone => ({
          organization_id: this.config.organizationId,
          phone_number: phone.number,
          friendly_name: phone.name || phone.number,
          provider: 'vapi',
          provider_id: phone.id,
          capabilities: ['voice', 'outbound'],
          is_active: phone.status === 'active',
          metadata: phone,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));
        
        const { error: insertError } = await supabase
          .from('phone_numbers')
          .insert(phoneRecords);
        
        if (insertError) {
          console.error('❌ Error inserting phone numbers:', insertError);
          return { success: false, count: 0, error: insertError.message };
        }
      }
      
      console.log(`✅ Synced ${phoneNumbers.length} phone numbers`);
      return { success: true, count: phoneNumbers.length };
      
    } catch (error: any) {
      console.error('❌ Error syncing phone numbers:', error);
      return { success: false, count: 0, error: error.message };
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
      console.log('🔍 Fetching VAPI assistants...');
      
      const response = await this.client.get('/assistant');
      
      if (!Array.isArray(response.data)) {
        console.warn('⚠️ VAPI returned non-array response for assistants');
        return [];
      }
      
      console.log(`✅ Retrieved ${response.data.length} assistants from VAPI`);
      return response.data;
      
    } catch (error: any) {
      console.error('❌ Error listing VAPI assistants:', error.message);
      
      if (error.response?.status === 401) {
        throw new Error('Invalid VAPI private key');
      }
      
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
      return response.data || [];
    } catch (error) {
      console.error('Error listing VAPI calls:', error);
      throw error;
    }
  }

  /**
   * Get phone numbers
   */
  async getPhoneNumbers(): Promise<any[]> {
    try {
      console.log('🔍 Fetching VAPI phone numbers...');
      
      const response = await this.client.get('/phone-number');
      
      if (!Array.isArray(response.data)) {
        console.warn('⚠️ VAPI returned non-array response for phone numbers');
        return [];
      }
      
      console.log(`✅ Retrieved ${response.data.length} phone numbers from VAPI`);
      return response.data;
      
    } catch (error: any) {
      console.error('❌ Error listing VAPI phone numbers:', error.message);
      
      if (error.response?.status === 401) {
        throw new Error('Invalid VAPI private key');
      }
      
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
   * Generate a qualification script based on campaign criteria
   */
  async generateQualificationScript(
    campaignId: string,
    qualificationFields: QualificationField[]
  ): Promise<string> {
    // Implementation for generating dynamic VAPI scripts based on qualification fields
    // This would integrate with the lead qualification system
    
    const requiredFields = qualificationFields.filter(f => f.is_required);
    const optionalFields = qualificationFields.filter(f => !f.is_required);
    
    let script = `You are a professional sales representative. Your goal is to qualify leads based on the following criteria:\n\n`;
    
    script += `REQUIRED INFORMATION TO GATHER:\n`;
    requiredFields.forEach(field => {
      script += `- ${field.field_name}: ${field.ai_detection_hints.join(', ')}\n`;
    });
    
    script += `\nOPTIONAL INFORMATION (if conversation allows):\n`;
    optionalFields.forEach(field => {
      script += `- ${field.field_name}: ${field.ai_detection_hints.join(', ')}\n`;
    });
    
    script += `\nIMPORTANT: Be conversational and natural. Don't interrogate the prospect. If they show disinterest or ask to end the call, politely thank them and end the conversation.`;
    
    return script;
  }

  /**
   * Update an assistant with qualification script
   */
  async updateAssistantWithQualification(
    assistantId: string,
    qualificationScript: string
  ): Promise<any> {
    return this.updateAssistant(assistantId, {
      model: {
        provider: 'openai',
        model: 'gpt-4',
        systemPrompt: qualificationScript
      }
    });
  }

  /**
   * Analyze if a script covers required qualification fields
   */
  analyzeScriptCoverage(
    script: string,
    qualificationFields: QualificationField[]
  ): { coverage: number; missingFields: string[] } {
    const missingFields: string[] = [];
    let coveredCount = 0;
    
    qualificationFields.forEach(field => {
      const keywords = field.ai_detection_hints;
      const isCovered = keywords.some(keyword => 
        script.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (isCovered) {
        coveredCount++;
      } else if (field.is_required) {
        missingFields.push(field.field_name);
      }
    });
    
    return {
      coverage: (coveredCount / qualificationFields.length) * 100,
      missingFields
    };
  }
}

export default VAPIIntegrationService;