import { Router, Response } from 'express';
import { AuthenticatedRequest, authenticateUser } from '../middleware/clerk-auth';
import { VAPIIntegrationService } from '../services/vapi-integration-service';
import supabase from '../services/supabase-client';

const router = Router();

// Apply authentication
router.use(authenticateUser);

/**
 * POST /api/vapi-sync/test
 * Test VAPI connection with current credentials
 * Admin only
 */
router.post('/test', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userRole = req.user?.role;
    
    // Only admins can test connection
    if (userRole !== 'platform_owner' && userRole !== 'client_admin') {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: 'Only administrators can test VAPI connection'
      });
    }

    if (!organizationId) {
      return res.status(400).json({ 
        error: 'User not associated with an organization' 
      });
    }

    console.log('🔌 Testing VAPI connection for organization:', organizationId);

    // Create VAPI service for the organization
    const vapiService = await VAPIIntegrationService.forOrganization(organizationId);
    
    if (!vapiService) {
      return res.status(400).json({ 
        error: 'VAPI not configured',
        message: 'Please configure VAPI credentials first',
        hasCredentials: false
      });
    }

    // Test the connection
    const testResult = await vapiService.testConnection();
    
    console.log('🔌 VAPI connection test result:', testResult);
    
    // Update last tested timestamp in database
    if (testResult.connected) {
      await supabase
        .from('organizations')
        .update({
          settings: supabase.sql`
            COALESCE(settings, '{}'::jsonb) || 
            jsonb_build_object('vapi', 
              COALESCE(settings->'vapi', '{}'::jsonb) || 
              jsonb_build_object(
                'lastTested', ${new Date().toISOString()},
                'testResult', ${JSON.stringify(testResult)}::jsonb
              )
            )
          `,
          updated_at: new Date().toISOString()
        })
        .eq('id', organizationId);
    }
    
    res.json({
      success: testResult.connected,
      message: testResult.message,
      details: testResult.details,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error testing VAPI connection:', error);
    res.status(500).json({ 
      success: false,
      error: 'Connection test failed',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /api/vapi-sync/assistants
 * Sync VAPI assistants to local database
 * Admin only
 */
router.post('/assistants', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userRole = req.user?.role;
    
    // Only admins can sync
    if (userRole !== 'platform_owner' && userRole !== 'client_admin') {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: 'Only administrators can sync VAPI assistants'
      });
    }

    if (!organizationId) {
      return res.status(400).json({ 
        error: 'User not associated with an organization' 
      });
    }

    console.log('🔄 Syncing VAPI assistants for organization:', organizationId);

    // Create VAPI service for the organization
    const vapiService = await VAPIIntegrationService.forOrganization(organizationId);
    
    if (!vapiService) {
      return res.status(400).json({ 
        error: 'VAPI not configured',
        message: 'Please configure VAPI credentials first',
        hasCredentials: false
      });
    }

    // Perform the sync
    const syncResult = await vapiService.syncAssistants();
    
    console.log('🔄 Assistant sync result:', syncResult);
    
    // Update sync timestamp in database
    if (syncResult.success) {
      await supabase
        .from('organizations')
        .update({
          settings: supabase.sql`
            COALESCE(settings, '{}'::jsonb) || 
            jsonb_build_object('vapi', 
              COALESCE(settings->'vapi', '{}'::jsonb) || 
              jsonb_build_object(
                'lastAssistantSync', ${new Date().toISOString()},
                'assistantCount', ${syncResult.count}
              )
            )
          `,
          updated_at: new Date().toISOString()
        })
        .eq('id', organizationId);
    }
    
    res.json({
      success: syncResult.success,
      count: syncResult.count,
      message: syncResult.success 
        ? `Successfully synced ${syncResult.count} assistants`
        : syncResult.error || 'Sync failed',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error syncing assistants:', error);
    res.status(500).json({ 
      success: false,
      error: 'Assistant sync failed',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /api/vapi-sync/phone-numbers
 * Sync VAPI phone numbers to local database
 * Admin only
 */
router.post('/phone-numbers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userRole = req.user?.role;
    
    // Only admins can sync
    if (userRole !== 'platform_owner' && userRole !== 'client_admin') {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: 'Only administrators can sync VAPI phone numbers'
      });
    }

    if (!organizationId) {
      return res.status(400).json({ 
        error: 'User not associated with an organization' 
      });
    }

    console.log('🔄 Syncing VAPI phone numbers for organization:', organizationId);

    // Create VAPI service for the organization
    const vapiService = await VAPIIntegrationService.forOrganization(organizationId);
    
    if (!vapiService) {
      return res.status(400).json({ 
        error: 'VAPI not configured',
        message: 'Please configure VAPI credentials first',
        hasCredentials: false
      });
    }

    // Perform the sync
    const syncResult = await vapiService.syncPhoneNumbers();
    
    console.log('🔄 Phone number sync result:', syncResult);
    
    // Update sync timestamp in database
    if (syncResult.success) {
      await supabase
        .from('organizations')
        .update({
          settings: supabase.sql`
            COALESCE(settings, '{}'::jsonb) || 
            jsonb_build_object('vapi', 
              COALESCE(settings->'vapi', '{}'::jsonb) || 
              jsonb_build_object(
                'lastPhoneSync', ${new Date().toISOString()},
                'phoneCount', ${syncResult.count}
              )
            )
          `,
          updated_at: new Date().toISOString()
        })
        .eq('id', organizationId);
    }
    
    res.json({
      success: syncResult.success,
      count: syncResult.count,
      message: syncResult.success 
        ? `Successfully synced ${syncResult.count} phone numbers`
        : syncResult.error || 'Sync failed',
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error syncing phone numbers:', error);
    res.status(500).json({ 
      success: false,
      error: 'Phone number sync failed',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * POST /api/vapi-sync/all
 * Sync both assistants and phone numbers
 * Admin only
 */
router.post('/all', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userRole = req.user?.role;
    
    // Only admins can sync
    if (userRole !== 'platform_owner' && userRole !== 'client_admin') {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: 'Only administrators can sync VAPI data'
      });
    }

    if (!organizationId) {
      return res.status(400).json({ 
        error: 'User not associated with an organization' 
      });
    }

    console.log('🔄 Syncing all VAPI data for organization:', organizationId);

    // Create VAPI service for the organization
    const vapiService = await VAPIIntegrationService.forOrganization(organizationId);
    
    if (!vapiService) {
      return res.status(400).json({ 
        error: 'VAPI not configured',
        message: 'Please configure VAPI credentials first',
        hasCredentials: false
      });
    }

    // Sync both assistants and phone numbers
    const [assistantResult, phoneResult] = await Promise.all([
      vapiService.syncAssistants(),
      vapiService.syncPhoneNumbers()
    ]);
    
    console.log('🔄 Full sync results:', { assistantResult, phoneResult });
    
    // Update sync timestamps in database
    await supabase
      .from('organizations')
      .update({
        settings: supabase.sql`
          COALESCE(settings, '{}'::jsonb) || 
          jsonb_build_object('vapi', 
            COALESCE(settings->'vapi', '{}'::jsonb) || 
            jsonb_build_object(
              'lastFullSync', ${new Date().toISOString()},
              'assistantCount', ${assistantResult.count},
              'phoneCount', ${phoneResult.count}
            )
          )
        `,
        updated_at: new Date().toISOString()
      })
      .eq('id', organizationId);
    
    res.json({
      success: assistantResult.success && phoneResult.success,
      assistants: {
        success: assistantResult.success,
        count: assistantResult.count,
        error: assistantResult.error
      },
      phoneNumbers: {
        success: phoneResult.success,
        count: phoneResult.count,
        error: phoneResult.error
      },
      message: `Synced ${assistantResult.count} assistants and ${phoneResult.count} phone numbers`,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error in full sync:', error);
    res.status(500).json({ 
      success: false,
      error: 'Full sync failed',
      message: error.message || 'Internal server error'
    });
  }
});

/**
 * GET /api/vapi-sync/status
 * Get current sync status for the organization
 * Admin only
 */
router.get('/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userRole = req.user?.role;
    
    // Only admins can view sync status
    if (userRole !== 'platform_owner' && userRole !== 'client_admin') {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: 'Only administrators can view sync status'
      });
    }

    if (!organizationId) {
      return res.status(400).json({ 
        error: 'User not associated with an organization' 
      });
    }

    // Get organization settings
    const { data: org, error } = await supabase
      .from('organizations')
      .select('settings, vapi_public_key, vapi_private_key')
      .eq('id', organizationId)
      .single();

    if (error || !org) {
      return res.status(404).json({ 
        error: 'Organization not found' 
      });
    }

    const vapiSettings = org.settings?.vapi || {};
    const hasCredentials = !!(org.vapi_private_key && (org.vapi_public_key || org.vapi_api_key));

    // Get counts from local database
    const [assistantCount, phoneCount] = await Promise.all([
      supabase
        .from('vapi_assistants')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('is_active', true),
      supabase
        .from('phone_numbers')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('provider', 'vapi')
        .eq('is_active', true)
    ]);

    res.json({
      hasCredentials,
      configured: hasCredentials,
      lastTested: vapiSettings.lastTested,
      testResult: vapiSettings.testResult,
      lastAssistantSync: vapiSettings.lastAssistantSync,
      lastPhoneSync: vapiSettings.lastPhoneSync,
      lastFullSync: vapiSettings.lastFullSync,
      localCounts: {
        assistants: assistantCount.count || 0,
        phoneNumbers: phoneCount.count || 0
      },
      syncedCounts: {
        assistants: vapiSettings.assistantCount || 0,
        phoneNumbers: vapiSettings.phoneCount || 0
      }
    });

  } catch (error: any) {
    console.error('❌ Error getting sync status:', error);
    res.status(500).json({ 
      error: 'Failed to get sync status',
      message: error.message || 'Internal server error'
    });
  }
});

export default router;