import { Router, Response } from 'express';
import { AuthenticatedRequest, authenticateUser } from '../middleware/clerk-auth';
import supabase from '../services/supabase-client';

const router = Router();

// Apply authentication
router.use(authenticateUser);

// GET /api/vapi-credentials - Get VAPI credentials for the user's organization
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ 
        error: 'User not associated with an organization',
        hasApiKey: false 
      });
    }

    console.log('🔑 Fetching VAPI credentials for organization:', organizationId);

    // Get organization with VAPI credentials
    const { data: organization, error } = await supabase
      .from('organizations')
      .select('id, name, vapi_api_key, vapi_private_key, vapi_webhook_url, settings')
      .eq('id', organizationId)
      .single();

    if (error || !organization) {
      console.error('❌ Error fetching organization:', error);
      return res.status(404).json({ 
        error: 'Organization not found',
        hasApiKey: false 
      });
    }

    // Check if organization has VAPI credentials
    const hasApiKey = !!(organization.vapi_api_key || organization.settings?.vapi?.apiKey);
    const hasPrivateKey = !!(organization.vapi_private_key || organization.settings?.vapi?.privateKey);

    // For security, we only send back whether keys exist, not the actual keys
    const response = {
      hasApiKey,
      hasPrivateKey,
      hasCredentials: hasApiKey && hasPrivateKey,
      organizationId: organization.id,
      organizationName: organization.name
    };

    // Only include actual credentials for admin users
    if (req.user?.role === 'platform_owner' || req.user?.role === 'client_admin') {
      response['credentials'] = {
        vapi_api_key: organization.vapi_api_key || organization.settings?.vapi?.apiKey,
        vapi_private_key: organization.vapi_private_key || organization.settings?.vapi?.privateKey,
        vapi_webhook_url: organization.vapi_webhook_url || `${process.env.BACKEND_URL}/api/vapi-webhook`
      };
    }

    console.log('✅ VAPI credentials check:', { hasApiKey, hasPrivateKey });
    res.json(response);

  } catch (error) {
    console.error('❌ Error in VAPI credentials endpoint:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      hasApiKey: false 
    });
  }
});

// PUT /api/vapi-credentials - Update VAPI credentials
router.put('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userRole = req.user?.role;
    
    // Only admins can update credentials
    if (userRole !== 'platform_owner' && userRole !== 'client_admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    if (!organizationId) {
      return res.status(400).json({ error: 'User not associated with an organization' });
    }

    const { vapi_api_key, vapi_private_key, vapi_webhook_url } = req.body;

    // Update organization with new credentials
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (vapi_api_key !== undefined) {
      updateData.vapi_api_key = vapi_api_key;
    }

    if (vapi_private_key !== undefined) {
      updateData.vapi_private_key = vapi_private_key;
    }

    if (vapi_webhook_url !== undefined) {
      updateData.vapi_webhook_url = vapi_webhook_url;
    }

    // Also update settings JSONB for compatibility
    updateData.settings = {
      vapi: {
        apiKey: vapi_api_key,
        privateKey: vapi_private_key,
        webhookUrl: vapi_webhook_url,
        updated_at: new Date().toISOString()
      }
    };

    const { data: organization, error } = await supabase
      .from('organizations')
      .update(updateData)
      .eq('id', organizationId)
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating VAPI credentials:', error);
      return res.status(500).json({ error: 'Failed to update credentials' });
    }

    console.log('✅ VAPI credentials updated for organization:', organizationId);
    res.json({ 
      message: 'Credentials updated successfully',
      hasApiKey: !!vapi_api_key,
      hasPrivateKey: !!vapi_private_key
    });

  } catch (error) {
    console.error('❌ Error updating VAPI credentials:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;