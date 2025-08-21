import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/clerk-auth';
import supabase from '../services/supabase-client';

const router = Router();

// Apply authentication to all routes

// GET /api/organizations - Get all organizations
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // TEMPORARY: For development, show all organizations
    const userId = req.user?.id || 'dev-user';
    const userRole = req.user?.role || 'platform_owner';

    console.log('🔍 Fetching organizations for user:', { userId, userRole });

    let query = supabase.from('organizations').select('*');

    // For now, show all organizations in development
    // if (userRole !== 'platform_owner') {
    //   const userOrgId = req.user?.organizationId;
    //   if (userOrgId) {
    //     query = query.eq('id', userOrgId);
    //   } else {
    //     return res.json({ organizations: [] });
    //   }
    // }

    const { data: organizations, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching organizations:', error);
      return res.status(500).json({ 
        error: 'Failed to fetch organizations',
        details: error.message 
      });
    }

    console.log('✅ Organizations fetched successfully:', organizations?.length || 0);

    // Add basic metrics to each organization using actual schema
    const organizationsWithMetrics = await Promise.all(
      (organizations || []).map(async (org) => {
        try {
          // Get user count
          const { data: users, error: usersError } = await supabase
            .from('users')
            .select('id')
            .eq('organization_id', org.id);

          return {
            ...org,
            users_count: users?.length || 0,
            campaigns_count: 0, // Will be added when campaigns are implemented
            calls_count: 0, // Will be added when calls are implemented
            subscription_tier: org.plan || 'basic',
            is_active: org.status === 'active'
          };
        } catch (err) {
          console.warn('⚠️ Error getting metrics for org:', org.id, err);
          return {
            ...org,
            users_count: 0,
            campaigns_count: 0,
            calls_count: 0,
            subscription_tier: org.plan || 'basic',
            is_active: org.status === 'active'
          };
        }
      })
    );

    res.json({
      organizations: organizationsWithMetrics,
      pagination: {
        page: 1,
        limit: 50,
        total: organizationsWithMetrics.length,
        totalPages: 1
      }
    });
  } catch (error) {
    console.error('❌ Error in organizations GET:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/organizations/:id - Get single organization
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    // TEMPORARY: For development, bypass auth
    const userId = req.user?.id || 'dev-user';
    const userRole = req.user?.role || 'platform_owner';

    // TEMPORARY: Commented out for development
    // if (!userId) {
    //   return res.status(401).json({ error: 'Unauthorized' });
    // }

    // // Check access permissions
    // if (userRole !== 'platform_owner' && req.user?.organizationId !== id) {
    //   return res.status(403).json({ error: 'Access denied' });
    // }

    const { data: organization, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('❌ Error fetching organization:', error);
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Get additional details
    try {
      const { data: users } = await supabase
        .from('users')
        .select('id, email, first_name, last_name, role, status')
        .eq('organization_id', id);

      const organizationWithDetails = {
        ...organization,
        users: users || [],
        users_count: users?.length || 0,
        subscription_tier: organization.plan || 'basic',
        is_active: organization.status === 'active'
      };

      res.json({ organization: organizationWithDetails });
    } catch (err) {
      console.warn('⚠️ Error getting organization details:', err);
      res.json({ 
        organization: {
          ...organization,
          users: [],
          users_count: 0,
          subscription_tier: organization.plan || 'basic',
          is_active: organization.status === 'active'
        }
      });
    }
  } catch (error) {
    console.error('❌ Error in organization GET:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/organizations - Create new organization
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, type = 'agency', plan = 'basic' } = req.body;
    const userRole = req.user?.role;

    // Only platform owners can create organizations
    if (userRole !== 'platform_owner') {
      return res.status(403).json({ error: 'Only platform owners can create organizations' });
    }

    if (!name) {
      return res.status(400).json({ error: 'Organization name is required' });
    }

    // Generate slug from name
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const { data: organization, error } = await supabase
      .from('organizations')
      .insert({
        name,
        slug,
        type,
        plan,
        status: 'active'
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating organization:', error);
      return res.status(500).json({ error: 'Failed to create organization' });
    }

    res.status(201).json({ organization });
  } catch (error) {
    console.error('❌ Error in organization POST:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/organizations/:id - Update organization
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, type, plan, status, vapi_api_key, vapi_private_key } = req.body;
    const userRole = req.user?.role;

    // Check permissions
    if (userRole !== 'platform_owner' && req.user?.organizationId !== id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updateData: any = { updated_at: new Date().toISOString() };
    
    if (name) updateData.name = name;
    if (type) updateData.type = type;
    if (plan) updateData.plan = plan;
    if (status) updateData.status = status;
    if (vapi_api_key !== undefined) updateData.vapi_api_key = vapi_api_key;
    if (vapi_private_key !== undefined) updateData.vapi_private_key = vapi_private_key;

    const { data: organization, error } = await supabase
      .from('organizations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating organization:', error);
      return res.status(500).json({ error: 'Failed to update organization' });
    }

    res.json({ organization });
  } catch (error) {
    console.error('❌ Error in organization PUT:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/organizations/:id - Delete organization
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role;

    // Only platform owners can delete organizations
    if (userRole !== 'platform_owner') {
      return res.status(403).json({ error: 'Only platform owners can delete organizations' });
    }

    const { error } = await supabase
      .from('organizations')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('❌ Error deleting organization:', error);
      return res.status(500).json({ error: 'Failed to delete organization' });
    }

    res.json({ message: 'Organization deleted successfully' });
  } catch (error) {
    console.error('❌ Error in organization DELETE:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/organizations/:id/settings - Update organization settings
router.put('/:id/settings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { vapiApiKey, vapiPrivateKey, vapiWebhookUrl, vapiEnabled } = req.body;
    const userRole = req.user?.role;

    // Check permissions
    if (userRole !== 'platform_owner' && req.user?.organizationId !== id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    console.log('🔧 Updating organization settings for:', id);

    // Save VAPI credentials directly in organizations table
    if (vapiApiKey || vapiPrivateKey || vapiWebhookUrl || vapiEnabled !== undefined) {
      console.log('🔑 Saving VAPI credentials to organizations table...');
      
      // Prepare VAPI settings object
      const vapiSettings = {
        apiKey: vapiApiKey || '',
        privateKey: vapiPrivateKey || '',
        webhookUrl: vapiWebhookUrl || 'https://api.apexai.com/webhooks/vapi',
        enabled: vapiEnabled !== undefined ? vapiEnabled : true,
        configured_at: new Date().toISOString()
      };

      // Update organizations table with VAPI settings
      const { error: updateError } = await supabase
        .from('organizations')
        .update({
          // Store in existing JSONB settings column
          settings: {
            vapi: vapiSettings
          },
          // Store in dedicated VAPI columns
          vapi_api_key: vapiApiKey || null, // Public key
          vapi_private_key: vapiPrivateKey || null, // Private key
          vapi_settings: JSON.stringify(vapiSettings),
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (updateError) {
        console.error('❌ Error saving VAPI credentials to organizations table:', updateError);
        
        // Fallback: Try just updating the settings column
        const { error: fallbackError } = await supabase
          .from('organizations')
          .update({
            settings: {
              vapi: vapiSettings
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', id);

        if (fallbackError) {
          console.error('❌ Fallback update also failed:', fallbackError);
          return res.status(500).json({ error: 'Failed to save VAPI credentials' });
        }

        console.log('✅ VAPI credentials saved using fallback method');
      } else {
        console.log('✅ VAPI credentials saved successfully in organizations table');
      }
    }

    res.json({ 
      success: true, 
      message: 'Organization settings updated successfully' 
    });
  } catch (error) {
    console.error('❌ Error updating organization settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/organizations/:id/check-schema - Check if VAPI columns exist
router.get('/:id/check-schema', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    console.log('🔍 Checking organizations table schema for VAPI columns...');
    
    // Try to select VAPI columns to see if they exist
    const { data: org, error } = await supabase
      .from('organizations')
      .select('id, vapi_api_key, vapi_assistant_id, vapi_phone_number_id, vapi_webhook_url, vapi_settings')
      .eq('id', id)
      .single();
    
    let hasVapiColumns = false;
    let errorDetails = null;
    
    if (error) {
      console.error('❌ Error checking VAPI columns:', error);
      errorDetails = error;
      
      // Check if error is due to missing columns
      if (error.message?.includes('column') && error.message?.includes('does not exist')) {
        hasVapiColumns = false;
        console.log('❌ VAPI columns do not exist - migration needed');
      } else {
        return res.status(500).json({ 
          error: 'Failed to check database schema',
          details: error
        });
      }
    } else {
      hasVapiColumns = true;
      console.log('✅ VAPI columns exist:', {
        hasApiKey: !!org?.vapi_api_key,
        hasSettings: !!org?.vapi_settings,
        data: org
      });
    }
    
    res.json({
      success: true,
      hasVapiColumns,
      needsMigration: !hasVapiColumns,
      organization: hasVapiColumns ? org : null,
      error: errorDetails
    });
  } catch (error) {
    console.error('❌ Schema check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/organizations/:id/migrate-schema - Add missing VAPI columns
router.post('/:id/migrate-schema', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userRole = req.user?.role;
    
    // Only platform owners can run migrations
    if (userRole !== 'platform_owner') {
      return res.status(403).json({ error: 'Access denied - admin only' });
    }
    
    console.log('🔧 Adding missing VAPI columns to organizations table...');
    
    // Execute the migration SQL directly
    const migrationSQL = `
      ALTER TABLE organizations 
      ADD COLUMN IF NOT EXISTS vapi_api_key TEXT,
      ADD COLUMN IF NOT EXISTS vapi_assistant_id TEXT,
      ADD COLUMN IF NOT EXISTS vapi_phone_number_id TEXT,
      ADD COLUMN IF NOT EXISTS vapi_webhook_url TEXT,
      ADD COLUMN IF NOT EXISTS vapi_settings JSONB DEFAULT '{}'::jsonb;
    `;
    
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });
    
    if (error) {
      console.error('❌ Migration failed:', error);
      return res.status(500).json({ error: 'Migration failed', details: error });
    }
    
    console.log('✅ VAPI columns migration completed');
    
    res.json({
      success: true,
      message: 'VAPI columns added successfully',
      data
    });
  } catch (error) {
    console.error('❌ Migration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/organizations/:id/settings - Get organization settings
router.get('/:id/settings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role;

    // Check permissions
    if (userRole !== 'platform_owner' && req.user?.organizationId !== id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    console.log('🔍 Fetching organization settings for:', id);

    // Get organization with settings
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('settings, vapi_api_key, vapi_settings')
      .eq('id', id)
      .single();

    let vapiConfig = {
      apiKey: '',
      privateKey: '',
      webhookUrl: 'https://api.apexai.com/webhooks/vapi',
      enabled: false
    };

    if (organization && !orgError) {
      // Try to get VAPI settings from multiple possible locations
      let vapiSettings: any = null;
      
      // First, try the settings.vapi path
      if (organization.settings?.vapi) {
        vapiSettings = organization.settings.vapi;
      }
      // Then try the vapi_settings column
      else if (organization.vapi_settings) {
        try {
          vapiSettings = JSON.parse(organization.vapi_settings);
        } catch (parseError) {
          console.log('⚠️ Could not parse vapi_settings column');
        }
      }
      // Finally, try individual columns
      else if (organization.vapi_api_key) {
        vapiSettings = {
          apiKey: organization.vapi_api_key,
          privateKey: organization.vapi_api_key, // Use same key for both
          webhookUrl: 'https://api.apexai.com/webhooks/vapi',
          enabled: true
        };
      }

      if (vapiSettings) {
        vapiConfig = {
          apiKey: vapiSettings.apiKey || '',
          privateKey: vapiSettings.privateKey || vapiSettings.apiKey || '',
          webhookUrl: vapiSettings.webhookUrl || 'https://api.apexai.com/webhooks/vapi',
          enabled: vapiSettings.enabled !== undefined ? vapiSettings.enabled : true
        };
      }
    }

    res.json({
      success: true,
      settings: {
        vapi: vapiConfig
      }
    });
  } catch (error) {
    console.error('❌ Error fetching organization settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// TEMPORARY DEBUG ENDPOINT - REMOVE IN PRODUCTION
router.get('/:id/settings/debug', async (req: any, res: any) => {
  try {
    const { id } = req.params;
    console.log('🔍 DEBUG: Fetching organization settings for:', id);

    // Get organization with settings directly from database
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('settings, vapi_api_key, vapi_settings')
      .eq('id', id)
      .single();

    if (orgError || !organization) {
      console.error('❌ DEBUG: Organization not found:', orgError);
      return res.status(404).json({ error: 'Organization not found' });
    }

    console.log('✅ DEBUG: Organization found:', organization);

    let vapiConfig = {
      apiKey: '',
      privateKey: '',
      webhookUrl: 'https://api.apexai.com/webhooks/vapi',
      enabled: false
    };

    // Try to get VAPI settings from multiple possible locations
    let vapiSettings: any = null;
    
    // First, try the settings.vapi path
    if (organization.settings?.vapi) {
      vapiSettings = organization.settings.vapi;
      console.log('✅ DEBUG: Found VAPI settings in settings.vapi');
    }
    // Then try the vapi_settings column
    else if (organization.vapi_settings) {
      try {
        vapiSettings = JSON.parse(organization.vapi_settings);
        console.log('✅ DEBUG: Found VAPI settings in vapi_settings column');
      } catch (parseError) {
        console.log('⚠️ DEBUG: Could not parse vapi_settings column');
      }
    }
    // Finally, try individual columns
    else if (organization.vapi_api_key) {
      vapiSettings = {
        apiKey: organization.vapi_api_key,
        privateKey: organization.vapi_api_key,
        webhookUrl: 'https://api.apexai.com/webhooks/vapi',
        enabled: true
      };
      console.log('✅ DEBUG: Found VAPI settings in individual columns');
    }

    if (vapiSettings) {
      vapiConfig = {
        apiKey: vapiSettings.apiKey || '',
        privateKey: vapiSettings.privateKey || vapiSettings.apiKey || '',
        webhookUrl: vapiSettings.webhookUrl || 'https://api.apexai.com/webhooks/vapi',
        enabled: vapiSettings.enabled !== undefined ? vapiSettings.enabled : true
      };
    }

    console.log('✅ DEBUG: Final VAPI config:', vapiConfig);

    res.json({
      success: true,
      debug: true,
      settings: {
        vapi: vapiConfig
      },
      raw: organization
    });
  } catch (error) {
    console.error('❌ DEBUG: Error fetching organization settings:', error);
    res.status(500).json({ error: 'Internal server error', debug: true });
  }
});


// PUT /api/organizations/:id
router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated
    delete updates.id;
    delete updates.created_at;
    delete updates.slug; // Slug shouldn't change

    updates.updated_at = new Date().toISOString();

    const { data: organization, error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating organization:', error);
      return res.status(500).json({
        error: 'Failed to update organization',
        details: error.message
      });
    }

    res.json(organization);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/organizations/:id/users
router.get('/:id/users', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('organization_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching organization users:', error);
      return res.status(500).json({
        error: 'Failed to fetch users',
        details: error.message
      });
    }

    res.json({ users: users || [] });
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router; 