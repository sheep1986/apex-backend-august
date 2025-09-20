import { Router, Response } from 'express';
import { AuthenticatedRequest, authenticateUser } from '../middleware/clerk-auth';
import { createClient } from '@supabase/supabase-js';

// Create supabase client directly to avoid import issues
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Import VAPIIntegrationService class directly to avoid module resolution issues
import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';

interface VAPIConfig {
  apiKey: string;
  publicKey?: string;
  webhookSecret?: string;
  organizationId: string;
}

class VAPIIntegrationService {
  private client: AxiosInstance;
  private config: VAPIConfig;

  constructor(config: VAPIConfig) {
    this.config = config;
    
    if (!config.apiKey) {
      throw new Error('VAPI private key is required for API authentication');
    }
    
    this.client = axios.create({
      baseURL: 'https://api.vapi.ai',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000,
      validateStatus: (status) => status < 500
    });
  }

  static async forOrganization(organizationId: string): Promise<VAPIIntegrationService | null> {
    try {
      console.log('🔄 Fetching VAPI credentials for organization:', organizationId);
      
      const { data: organization, error: orgError } = await supabase
        .from('organizations')
        .select('settings, vapi_public_key, vapi_api_key, vapi_private_key, vapi_settings, vapi_webhook_url')
        .eq('id', organizationId)
        .single();

      if (!organization || orgError) {
        console.log('⚠️ No organization found or error:', orgError);
        return null;
      }

      let publicKey: string | null = null;
      let privateKey: string | null = null;
      let webhookUrl: string | null = null;
      
      publicKey = organization.vapi_public_key || organization.vapi_api_key;
      privateKey = organization.vapi_private_key;
      webhookUrl = organization.vapi_webhook_url;
      
      if (!privateKey && organization.settings?.vapi) {
        const vapiSettings = organization.settings.vapi;
        privateKey = vapiSettings.privateKey || vapiSettings.apiKey;
        publicKey = publicKey || vapiSettings.publicKey || vapiSettings.apiKey;
        webhookUrl = webhookUrl || vapiSettings.webhookUrl;
      }
      
      if (!privateKey && organization.vapi_settings) {
        try {
          const settings = typeof organization.vapi_settings === 'string' 
            ? JSON.parse(organization.vapi_settings) 
            : organization.vapi_settings;
          
          privateKey = privateKey || settings.privateKey || settings.apiKey;
          publicKey = publicKey || settings.publicKey;
          webhookUrl = webhookUrl || settings.webhookUrl;
          
          if (settings.enabled === false) {
            console.log('⚠️ VAPI integration is disabled for this organization');
            return null;
          }
        } catch (parseError) {
          console.log('⚠️ Could not parse vapi_settings column:', parseError);
        }
      }
      
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
        apiKey: privateKey,
        publicKey: publicKey || undefined,
        organizationId,
        webhookSecret: webhookUrl || `${process.env.BACKEND_URL}/api/vapi-webhook`
      };
      
      return new VAPIIntegrationService(config);

    } catch (error) {
      console.error('❌ Error creating VAPI service:', error);
      return null;
    }
  }

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
      console.error('❌ Error fetching assistants:', error.message);
      if (error.response?.status === 401) {
        throw new Error('Invalid VAPI API key');
      }
      throw error;
    }
  }

  async getPhoneNumbers(): Promise<any[]> {
    try {
      console.log('📱 Fetching VAPI phone numbers...');
      
      const response = await this.client.get('/phone-number');
      
      if (!Array.isArray(response.data)) {
        console.warn('⚠️ VAPI returned non-array response for phone numbers');
        return [];
      }
      
      console.log(`✅ Retrieved ${response.data.length} phone numbers from VAPI`);
      return response.data;
    } catch (error: any) {
      console.error('❌ Error fetching phone numbers:', error.message);
      if (error.response?.status === 401) {
        throw new Error('Invalid VAPI API key');
      }
      throw error;
    }
  }
}

const router = Router();

// Apply authentication
router.use(authenticateUser);

// GET /api/vapi-data/assistants - Get VAPI assistants for the user's organization
router.get('/assistants', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ 
        error: 'User not associated with an organization',
        assistants: [] 
      });
    }

    console.log('🔍 Fetching VAPI assistants for organization:', organizationId);

    // Get VAPI service for the organization
    const vapiService = await VAPIIntegrationService.forOrganization(organizationId);
    
    if (!vapiService) {
      console.log('⚠️ No VAPI service available for organization');
      return res.json({ 
        assistants: [],
        message: 'VAPI integration not configured. Please add your VAPI API key in Organization Settings.',
        requiresConfiguration: true
      });
    }

    // Fetch assistants from VAPI
    const assistants = await vapiService.listAssistants();
    
    console.log(`✅ Retrieved ${assistants.length} assistants from VAPI`);
    
    res.json({ 
      assistants,
      count: assistants.length 
    });

  } catch (error) {
    console.error('❌ Error fetching VAPI assistants:', error);
    res.status(500).json({ 
      error: 'Failed to fetch assistants',
      assistants: [] 
    });
  }
});

// GET /api/vapi-data/phone-numbers - Get VAPI phone numbers for the user's organization
router.get('/phone-numbers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ 
        error: 'User not associated with an organization',
        phoneNumbers: [] 
      });
    }

    console.log('📱 Fetching phone numbers for organization:', organizationId);

    // First try to fetch from Supabase
    let phoneNumbers = [];
    
    try {
      const { data: dbPhoneNumbers, error } = await supabase
        .from('phone_numbers')
        .select('*')
        .eq('organization_id', organizationId);
        
      if (!error && dbPhoneNumbers && dbPhoneNumbers.length > 0) {
        console.log(`✅ Found ${dbPhoneNumbers.length} phone numbers in database`);
        phoneNumbers = dbPhoneNumbers.map(phone => ({
          id: phone.id,
          number: phone.number,
          provider: phone.provider || 'vapi',
          country: phone.country_code || 'US',
          name: phone.number,
          status: phone.status
        }));
      } else {
        console.log('📡 No phone numbers in database, trying VAPI API...');
        const vapiService = await VAPIIntegrationService.forOrganization(organizationId);
        
        if (!vapiService) {
          console.log('⚠️ No VAPI service available for organization');
          return res.json({ 
            phoneNumbers: [],
            message: 'VAPI integration not configured. Please add your VAPI API key in Organization Settings.',
            requiresConfiguration: true
          });
        }

        phoneNumbers = await vapiService.getPhoneNumbers();
      }
    } catch (error) {
      console.error('Error fetching from database, trying VAPI:', error);
      const vapiService = await VAPIIntegrationService.forOrganization(organizationId);
      if (vapiService) {
        phoneNumbers = await vapiService.getPhoneNumbers();
      }
    }
    
    console.log(`✅ Retrieved ${phoneNumbers.length} phone numbers from VAPI`);
    
    res.json({ 
      phoneNumbers,
      count: phoneNumbers.length 
    });

  } catch (error) {
    console.error('❌ Error fetching VAPI phone numbers:', error);
    res.status(500).json({ 
      error: 'Failed to fetch phone numbers',
      phoneNumbers: [] 
    });
  }
});

// GET /api/vapi-data/all - Get all VAPI data (assistants and phone numbers)
router.get('/all', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ 
        error: 'User not associated with an organization',
        assistants: [],
        phoneNumbers: [] 
      });
    }

    console.log('🔄 Fetching all VAPI data for organization:', organizationId);

    // Get VAPI service for the organization
    const vapiService = await VAPIIntegrationService.forOrganization(organizationId);
    
    if (!vapiService) {
      console.log('⚠️ No VAPI service available for organization');
      return res.json({ 
        assistants: [],
        phoneNumbers: [],
        message: 'VAPI integration not configured' 
      });
    }

    // Fetch both assistants and phone numbers in parallel
    const [assistants, phoneNumbers] = await Promise.all([
      vapiService.listAssistants().catch(() => []),
      vapiService.getPhoneNumbers().catch(() => [])
    ]);
    
    console.log(`✅ Retrieved ${assistants.length} assistants and ${phoneNumbers.length} phone numbers from VAPI`);
    
    res.json({ 
      assistants,
      phoneNumbers,
      assistantCount: assistants.length,
      phoneNumberCount: phoneNumbers.length
    });

  } catch (error) {
    console.error('❌ Error fetching VAPI data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch VAPI data',
      assistants: [],
      phoneNumbers: [] 
    });
  }
});

export default router;
