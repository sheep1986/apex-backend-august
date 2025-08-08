import axios, { AxiosInstance } from 'axios';

export interface VapiCall {
  id: string;
  orgId: string;
  createdAt: string;
  updatedAt: string;
  type: 'inboundPhoneCall' | 'outboundPhoneCall' | 'webCall';
  phoneNumberId?: string;
  assistantId?: string;
  customer?: {
    number?: string;
    name?: string;
  };
  status: 'queued' | 'ringing' | 'in-progress' | 'forwarding' | 'ended';
  endedReason?: string;
  startedAt?: string;
  endedAt?: string;
  cost?: number;
  recordingUrl?: string;
  transcript?: string;
  summary?: string;
}

export interface CreateCallRequest {
  assistantId: string;
  phoneNumberId: string;
  customer: {
    number: string;
    name?: string;
  };
  schedulePlan?: {
    earliestAt?: string;
    latestAt?: string;
  };
  // Add recording options
  recordingEnabled?: boolean;
  transcriptionEnabled?: boolean;
  stereoRecordingEnabled?: boolean;
}

export interface VapiAssistant {
  id: string;
  orgId: string;
  name: string;
  model: {
    provider: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  };
  voice: {
    provider: string;
    voiceId: string;
  };
  firstMessage?: string;
  systemMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VapiPhoneNumber {
  id: string;
  orgId: string;
  number: string;
  country: string;
  provider: string;
  providerId: string;
  createdAt: string;
  updatedAt: string;
}

export class VapiService {
  private api: AxiosInstance;
  private apiKey: string;
  private organizationId?: string;

  constructor(apiKey?: string, organizationId?: string) {
    this.apiKey = apiKey || process.env.VAPI_API_KEY || '';
    this.organizationId = organizationId;
    
    if (!this.apiKey) {
      console.warn('⚠️ VAPI API key not provided - service will not function');
    }

    this.api = axios.create({
      baseURL: 'https://api.vapi.ai',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });

    // Add request/response interceptors for logging
    this.api.interceptors.request.use(
      (config) => {
        console.log(`🔵 VAPI Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('❌ VAPI Request Error:', error);
        return Promise.reject(error);
      }
    );

    this.api.interceptors.response.use(
      (response) => {
        console.log(`🟢 VAPI Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error('❌ VAPI Response Error:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          url: error.config?.url,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Create an outbound call
   */
  async createCall(request: CreateCallRequest): Promise<VapiCall> {
    try {
      // Enable recording by default
      const callRequest = {
        ...request,
        recordingEnabled: request.recordingEnabled ?? true,
        transcriptionEnabled: request.transcriptionEnabled ?? true
      };
      
      const response = await this.api.post('/call', callRequest);
      return response.data;
    } catch (error) {
      console.error('❌ Error creating VAPI call:', error);
      throw new Error(`Failed to create call: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get call details
   */
  async getCall(callId: string): Promise<VapiCall> {
    try {
      console.log('🔍 Fetching VAPI call:', callId);
      const response = await this.api.get(`/call/${callId}`);
      console.log('✅ VAPI call data received:', {
        id: response.data?.id,
        status: response.data?.status,
        duration: response.data?.duration,
        hasRecording: !!response.data?.recordingUrl,
        hasTranscript: !!response.data?.transcript
      });
      return response.data;
    } catch (error: any) {
      console.error('❌ Error getting VAPI call:', {
        callId,
        status: error.response?.status,
        message: error.response?.data?.message || error.message
      });
      // Return null instead of throwing to allow fallback to database data
      return null;
    }
  }

  /**
   * List calls with pagination
   */
  async listCalls(params?: {
    limit?: number;
    createdAtGt?: string;
    createdAtLt?: string;
    assistantId?: string;
    phoneNumberId?: string;
  }): Promise<VapiCall[]> {
    try {
      const response = await this.api.get('/call', { params });
      return response.data;
    } catch (error) {
      console.error('❌ Error listing VAPI calls:', error);
      throw new Error(`Failed to list calls: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get all assistants
   */
  async getAssistants(): Promise<VapiAssistant[]> {
    try {
      const response = await this.api.get('/assistant');
      return response.data;
    } catch (error) {
      console.error('❌ Error getting VAPI assistants:', error);
      throw new Error(`Failed to get assistants: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get assistant by ID
   */
  async getAssistant(assistantId: string): Promise<VapiAssistant> {
    try {
      const response = await this.api.get(`/assistant/${assistantId}`);
      return response.data;
    } catch (error) {
      console.error('❌ Error getting VAPI assistant:', error);
      throw new Error(`Failed to get assistant: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get all phone numbers
   */
  async getPhoneNumbers(): Promise<VapiPhoneNumber[]> {
    try {
      const response = await this.api.get('/phone-numbers');
      return response.data;
    } catch (error) {
      console.error('❌ Error getting VAPI phone numbers:', error);
      throw new Error(`Failed to get phone numbers: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get phone number by ID
   */
  async getPhoneNumber(phoneNumberId: string): Promise<VapiPhoneNumber> {
    try {
      const response = await this.api.get(`/phone-number/${phoneNumberId}`);
      return response.data;
    } catch (error) {
      console.error('❌ Error getting VAPI phone number:', error);
      throw new Error(`Failed to get phone number: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Create a scheduled call
   */
  async createScheduledCall(request: CreateCallRequest & {
    schedulePlan: {
      earliestAt: string;
      latestAt?: string;
    };
  }): Promise<VapiCall> {
    try {
      const response = await this.api.post('/call', request);
      return response.data;
    } catch (error) {
      console.error('❌ Error creating scheduled VAPI call:', error);
      throw new Error(`Failed to create scheduled call: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get organization usage and limits
   */
  async getOrganization(): Promise<any> {
    try {
      const response = await this.api.get('/org');
      return response.data;
    } catch (error) {
      console.error('❌ Error getting VAPI organization:', error);
      throw new Error(`Failed to get organization: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Health check - verify VAPI connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.api.get('/org');
      return true;
    } catch (error) {
      console.error('❌ VAPI health check failed:', error);
      return false;
    }
  }

  /**
   * Format phone number for VAPI
   */
  formatPhoneNumber(phone: string): string {
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Add + prefix if not present
    if (digits.length === 10) {
      return `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    } else if (!digits.startsWith('+')) {
      return `+${digits}`;
    }
    
    return digits;
  }

  /**
   * Validate call request
   */
  validateCallRequest(request: CreateCallRequest): string[] {
    const errors: string[] = [];
    
    if (!request.assistantId) {
      errors.push('Assistant ID is required');
    }
    
    if (!request.phoneNumberId) {
      errors.push('Phone number ID is required');
    }
    
    if (!request.customer?.number) {
      errors.push('Customer phone number is required');
    } else {
      // Validate phone number format
      const phone = request.customer.number;
      if (!/^\+?[1-9]\d{1,14}$/.test(phone.replace(/\D/g, ''))) {
        errors.push('Invalid customer phone number format');
      }
    }
    
    return errors;
  }

  /**
   * Get concurrency limits
   */
  async getConcurrencyLimits(): Promise<{
    maxConcurrentCalls: number;
    currentConcurrentCalls: number;
    availableSlots: number;
  }> {
    try {
      const org = await this.getOrganization();
      const activeCalls = await this.listCalls({
        limit: 100,
        createdAtGt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Last 24 hours
      });
      
      const currentConcurrent = activeCalls.filter(call => 
        call.status === 'ringing' || call.status === 'in-progress'
      ).length;
      
      const maxConcurrent = org.concurrencyLimit || 10; // Default to 10 if not specified
      
      return {
        maxConcurrentCalls: maxConcurrent,
        currentConcurrentCalls: currentConcurrent,
        availableSlots: Math.max(0, maxConcurrent - currentConcurrent)
      };
    } catch (error) {
      console.error('❌ Error getting concurrency limits:', error);
      // Return conservative defaults
      return {
        maxConcurrentCalls: 1,
        currentConcurrentCalls: 0,
        availableSlots: 1
      };
    }
  }

  /**
   * Check if we can make a call now (considering concurrency)
   */
  async canMakeCall(): Promise<boolean> {
    try {
      const limits = await this.getConcurrencyLimits();
      return limits.availableSlots > 0;
    } catch (error) {
      console.error('❌ Error checking if can make call:', error);
      return false;
    }
  }

  /**
   * Factory method to create organization-specific VAPI service
   */
  static async forOrganization(organizationId: string): Promise<VapiService | null> {
    try {
      console.log(`🔍 Creating VAPI service for organization: ${organizationId}`);
      
      // Import here to avoid circular dependency
      const supabase = (await import('./supabase-client')).default;
      
      // Try organizations table first (primary location)
      const { data: organization, error: orgError } = await supabase
        .from('organizations')
        .select('settings, vapi_api_key, vapi_settings')
        .eq('id', organizationId)
        .single();

      if (organization && !orgError) {
        let vapiCredentials: any = null;
        
        // Check multiple locations for VAPI credentials
        if (organization.settings?.vapi?.apiKey) {
          vapiCredentials = organization.settings.vapi;
          console.log('✅ Found VAPI credentials in organizations.settings.vapi');
        } else if (organization.vapi_settings) {
          try {
            vapiCredentials = JSON.parse(organization.vapi_settings);
            console.log('✅ Found VAPI credentials in organizations.vapi_settings');
          } catch (parseError) {
            console.log('⚠️ Could not parse vapi_settings column');
          }
        } else if (organization.vapi_api_key) {
          vapiCredentials = {
            apiKey: organization.vapi_api_key,
            enabled: true
          };
          console.log('✅ Found VAPI credentials in organizations.vapi_api_key');
        }

        if (vapiCredentials?.apiKey && vapiCredentials.enabled !== false) {
          return new VapiService(vapiCredentials.apiKey, organizationId);
        }
      }

      // Fallback to organization_settings table
      const { data: settings, error: settingsError } = await supabase
        .from('organization_settings')
        .select('setting_value')
        .eq('organization_id', organizationId)
        .eq('setting_key', 'vapi_credentials')
        .single();

      if (settings && !settingsError) {
        try {
          const credentials = JSON.parse(settings.setting_value);
          if (credentials.apiKey && credentials.enabled !== false) {
            console.log('✅ Found VAPI credentials in organization_settings');
            return new VapiService(credentials.apiKey, organizationId);
          }
        } catch (parseError) {
          console.log('⚠️ Could not parse organization_settings VAPI credentials');
        }
      }

      console.log(`⚠️ No valid VAPI credentials found for organization: ${organizationId}`);
      return null;
    } catch (error) {
      console.error('❌ Error creating organization VAPI service:', error);
      return null;
    }
  }

  /**
   * Get organization ID associated with this service instance
   */
  getOrganizationId(): string | undefined {
    return this.organizationId;
  }

  /**
   * Update API key for this service instance
   */
  updateApiKey(newApiKey: string): void {
    this.apiKey = newApiKey;
    this.api.defaults.headers['Authorization'] = `Bearer ${newApiKey}`;
  }

  /**
   * Fetch recording URL for a call
   * Use this if webhook doesn't include recording URL
   */
  async fetchRecordingUrl(callId: string): Promise<string | null> {
    try {
      const call = await this.getCall(callId);
      
      if (call.recordingUrl) {
        console.log(`✅ Found recording URL for call ${callId}`);
        return call.recordingUrl;
      }
      
      if (call.stereoRecordingUrl) {
        console.log(`✅ Found stereo recording URL for call ${callId}`);
        return call.stereoRecordingUrl;
      }
      
      console.log(`⚠️ No recording URL found for call ${callId}`);
      return null;
    } catch (error) {
      console.error(`❌ Error fetching recording URL for call ${callId}:`, error);
      return null;
    }
  }
}

// Export singleton instance
export const vapiService = new VapiService();