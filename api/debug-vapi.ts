import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/clerk-auth';
import { supabaseService } from '../services/supabase-client';
import { VAPIIntegrationService } from '../services/vapi-integration-service';

const router = Router();

// Apply authentication to all routes

/**
 * GET /api/debug-vapi/settings
 * Debug endpoint to check VAPI settings for the current organization
 */
router.get('/settings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('🔍 Debugging VAPI settings for organization:', organizationId);

    // 1. Check organizations table
    const { data: organization, error: orgError } = await supabaseService
      .from('organizations')
      .select('id, name, settings, vapi_api_key, vapi_assistant_id, vapi_phone_number_id, vapi_webhook_url, vapi_settings')
      .eq('id', organizationId)
      .single();

    if (orgError) {
      console.error('❌ Error fetching organization:', orgError);
      return res.status(500).json({ error: 'Failed to fetch organization', details: orgError });
    }

    // 2. Check organization_settings table
    const { data: orgSettings, error: settingsError } = await supabaseService
      .from('organization_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('setting_key', 'vapi_credentials');

    // 3. Try to initialize VAPI service
    let vapiServiceStatus = {
      available: false,
      source: null as string | null,
      error: null as string | null
    };

    try {
      const vapiService = await VAPIIntegrationService.forOrganization(organizationId);
      if (vapiService) {
        vapiServiceStatus.available = true;
        
        // Determine where credentials were found
        if (organization?.settings?.vapi) {
          vapiServiceStatus.source = 'organizations.settings.vapi';
        } else if (organization?.vapi_settings) {
          vapiServiceStatus.source = 'organizations.vapi_settings';
        } else if (organization?.vapi_api_key) {
          vapiServiceStatus.source = 'organizations.vapi_api_key';
        } else if (orgSettings && orgSettings.length > 0) {
          vapiServiceStatus.source = 'organization_settings table';
        }
      }
    } catch (error) {
      vapiServiceStatus.error = error.message;
    }

    // 4. Get VAPI config details
    const vapiConfig = await VAPIIntegrationService.getOrganizationVAPIConfig(organizationId);

    // 5. Test VAPI API if credentials exist
    let apiTestResult = {
      tested: false,
      success: false,
      error: null as string | null,
      assistantsCount: 0,
      phoneNumbersCount: 0
    };

    if (vapiServiceStatus.available) {
      try {
        const vapiService = await VAPIIntegrationService.forOrganization(organizationId);
        if (vapiService) {
          apiTestResult.tested = true;
          
          // Test assistants endpoint
          try {
            const assistants = await vapiService.listAssistants();
            apiTestResult.assistantsCount = assistants.length;
          } catch (error) {
            console.error('❌ Error testing assistants endpoint:', error);
            apiTestResult.error = `Assistants: ${error.message}`;
          }
          
          // Test phone numbers endpoint
          try {
            const phoneNumbers = await vapiService.getPhoneNumbers();
            apiTestResult.phoneNumbersCount = phoneNumbers.length;
            apiTestResult.success = true;
          } catch (error) {
            console.error('❌ Error testing phone numbers endpoint:', error);
            apiTestResult.error = apiTestResult.error 
              ? `${apiTestResult.error}, Phone Numbers: ${error.message}`
              : `Phone Numbers: ${error.message}`;
          }
        }
      } catch (error) {
        apiTestResult.error = error.message;
      }
    }

    // 6. Check VAPI tables
    const { data: vapiAssistants } = await supabaseService
      .from('vapi_assistants')
      .select('id, name, vapi_assistant_id, is_active')
      .eq('organization_id', organizationId);

    // Prepare response
    const response = {
      organizationId,
      organizationName: organization?.name,
      vapiSettings: {
        // From organizations table
        hasVapiApiKey: !!organization?.vapi_api_key,
        vapiApiKeyMasked: organization?.vapi_api_key ? `***${organization.vapi_api_key.slice(-4)}` : null,
        vapiAssistantId: organization?.vapi_assistant_id,
        vapiPhoneNumberId: organization?.vapi_phone_number_id,
        vapiWebhookUrl: organization?.vapi_webhook_url,
        
        // Settings columns
        hasSettingsVapi: !!(organization?.settings?.vapi),
        hasVapiSettingsColumn: !!organization?.vapi_settings,
        vapiSettingsContent: organization?.vapi_settings ? 
          (typeof organization.vapi_settings === 'string' ? 
            'String data present' : 
            'JSON data present'
          ) : null,
        
        // From organization_settings table
        hasOrgSettingsRecord: orgSettings && orgSettings.length > 0,
        orgSettingsCount: orgSettings?.length || 0
      },
      vapiServiceStatus,
      vapiConfig,
      apiTestResult,
      localData: {
        vapiAssistantsCount: vapiAssistants?.length || 0,
        vapiAssistants: vapiAssistants || []
      },
      recommendations: []
    };

    // Add recommendations
    if (!vapiServiceStatus.available) {
      response.recommendations.push('No VAPI credentials found. Please configure VAPI settings in the Settings page.');
    } else if (!apiTestResult.success) {
      response.recommendations.push('VAPI credentials found but API test failed. Please verify your API key is valid.');
    } else if (apiTestResult.assistantsCount === 0) {
      response.recommendations.push('VAPI is connected but no assistants found. Create assistants in your VAPI dashboard.');
    } else if (apiTestResult.phoneNumbersCount === 0) {
      response.recommendations.push('VAPI is connected but no phone numbers found. Purchase phone numbers in your VAPI dashboard.');
    }

    res.json(response);
  } catch (error) {
    console.error('❌ Error in debug VAPI settings:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

/**
 * POST /api/debug-vapi/test-connection
 * Test VAPI connection with provided credentials
 */
router.post('/test-connection', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { apiKey } = req.body;
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }

    console.log('🔄 Testing VAPI connection with provided API key');

    // Create a temporary VAPI service instance
    const testService = new VAPIIntegrationService({
      apiKey,
      organizationId,
      webhookSecret: 'test'
    });

    const results = {
      apiKeyValid: false,
      assistants: { success: false, count: 0, error: null as string | null },
      phoneNumbers: { success: false, count: 0, error: null as string | null }
    };

    // Test assistants endpoint
    try {
      const assistants = await testService.listAssistants();
      results.assistants.success = true;
      results.assistants.count = assistants.length;
      results.apiKeyValid = true;
    } catch (error) {
      results.assistants.error = error.message;
    }

    // Test phone numbers endpoint
    try {
      const phoneNumbers = await testService.getPhoneNumbers();
      results.phoneNumbers.success = true;
      results.phoneNumbers.count = phoneNumbers.length;
      results.apiKeyValid = true;
    } catch (error) {
      results.phoneNumbers.error = error.message;
    }

    res.json({
      success: results.apiKeyValid,
      results
    });
  } catch (error) {
    console.error('❌ Error testing VAPI connection:', error);
    res.status(500).json({ 
      error: 'Failed to test connection',
      message: error.message 
    });
  }
});

export default router;