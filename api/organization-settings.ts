import express from 'express';
import { z } from 'zod';
import { authenticateUser, AuthenticatedRequest } from '../middleware/clerk-auth';
import supabase from '../services/supabase-client';

const router = express.Router();

// Validation schemas
const SetSettingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.any(),
  encrypted: z.boolean().default(false),
});

// Get organization settings (with inheritance)
router.get('/', async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { user } = req;
    const organizationId = user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({ error: 'User not associated with organization' });
    }

    // Get organization settings
    const { data: orgSettings, error: orgError } = await supabase
      .from('organization_settings')
      .select('*')
      .eq('organization_id', organizationId);

    if (orgError) {
      console.error('Error fetching organization settings:', orgError);
      return res.status(500).json({ error: 'Failed to fetch settings' });
    }

    // Transform array to key-value object
    const settings = {};
    orgSettings?.forEach(setting => {
      settings[setting.key] = setting.encrypted ? '[ENCRYPTED]' : setting.value;
    });

    res.json({
      organizationId,
      settings,
      count: orgSettings?.length || 0
    });
  } catch (error) {
    console.error('Error in get organization settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific setting
router.get('/:key', async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { user } = req;
    const { key } = req.params;
    const organizationId = user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({ error: 'User not associated with organization' });
    }

    const { data: setting, error } = await supabase
      .from('organization_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('key', key)
      .single();

    if (error && error.code !== 'PGRST116') { // Not found is ok
      console.error('Error fetching setting:', error);
      return res.status(500).json({ error: 'Failed to fetch setting' });
    }

    if (!setting) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json({
      key: setting.key,
      value: setting.encrypted ? '[ENCRYPTED]' : setting.value,
      encrypted: setting.encrypted,
      updatedAt: setting.updated_at
    });
  } catch (error) {
    console.error('Error in get setting:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Set organization setting (admin only)
router.post('/:key', async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { user } = req;
    const { key } = req.params;
    const { value, encrypted = false } = req.body;
    const organizationId = user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({ error: 'User not associated with organization' });
    }

    // Validate input
    const validation = SetSettingSchema.safeParse({ key, value, encrypted });
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: validation.error.errors 
      });
    }

    // Check if setting already exists
    const { data: existingSetting } = await supabase
      .from('organization_settings')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('key', key)
      .single();

    let result;
    
    if (existingSetting) {
      // Update existing setting
      const { data, error } = await supabase
        .from('organization_settings')
        .update({
          value: encrypted ? Buffer.from(JSON.stringify(value)).toString('base64') : value,
          encrypted,
          updated_at: new Date().toISOString()
        })
        .eq('organization_id', organizationId)
        .eq('key', key)
        .select()
        .single();
      
      result = { data, error };
    } else {
      // Create new setting
      const { data, error } = await supabase
        .from('organization_settings')
        .insert({
          organization_id: organizationId,
          key,
          value: encrypted ? Buffer.from(JSON.stringify(value)).toString('base64') : value,
          encrypted,
          created_by: user?.userId
        })
        .select()
        .single();
      
      result = { data, error };
    }

    if (result.error) {
      console.error('Error setting organization setting:', result.error);
      return res.status(500).json({ error: 'Failed to save setting' });
    }

    // Log the change
    await supabase
      .from('organization_audit_logs')
      .insert({
        organization_id: organizationId,
        user_id: user?.userId,
        action: existingSetting ? 'setting_updated' : 'setting_created',
        details: {
          key,
          encrypted,
          timestamp: new Date().toISOString()
        }
      });

    res.json({
      message: `Setting ${existingSetting ? 'updated' : 'created'} successfully`,
      key,
      encrypted
    });
  } catch (error) {
    console.error('Error in set organization setting:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete organization setting (admin only)
router.delete('/:key', async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { user } = req;
    const { key } = req.params;
    const organizationId = user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({ error: 'User not associated with organization' });
    }

    const { error } = await supabase
      .from('organization_settings')
      .delete()
      .eq('organization_id', organizationId)
      .eq('key', key);

    if (error) {
      console.error('Error deleting organization setting:', error);
      return res.status(500).json({ error: 'Failed to delete setting' });
    }

    // Log the change
    await supabase
      .from('organization_audit_logs')
      .insert({
        organization_id: organizationId,
        user_id: user?.userId,
        action: 'setting_deleted',
        details: {
          key,
          timestamp: new Date().toISOString()
        }
      });

    res.json({
      message: 'Setting deleted successfully',
      key
    });
  } catch (error) {
    console.error('Error in delete organization setting:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk update settings (admin only)
router.put('/bulk', async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { user } = req;
    const { settings } = req.body;
    const organizationId = user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({ error: 'User not associated with organization' });
    }

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings must be an object' });
    }

    const results = [];
    const errors = [];

    for (const [key, settingData] of Object.entries(settings)) {
      try {
        const { value, encrypted = false } = settingData as any;
        
        // Check if setting exists
        const { data: existingSetting } = await supabase
          .from('organization_settings')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('key', key)
          .single();

        if (existingSetting) {
          // Update
          await supabase
            .from('organization_settings')
            .update({
              value: encrypted ? Buffer.from(JSON.stringify(value)).toString('base64') : value,
              encrypted,
              updated_at: new Date().toISOString()
            })
            .eq('organization_id', organizationId)
            .eq('key', key);
        } else {
          // Insert
          await supabase
            .from('organization_settings')
            .insert({
              organization_id: organizationId,
              key,
              value: encrypted ? Buffer.from(JSON.stringify(value)).toString('base64') : value,
              encrypted,
              created_by: user?.userId
            });
        }

        results.push({ key, status: 'success' });
      } catch (error) {
        console.error(`Error updating setting ${key}:`, error);
        errors.push({ key, error: error.message });
      }
    }

    // Log bulk update
    await supabase
      .from('organization_audit_logs')
      .insert({
        organization_id: organizationId,
        user_id: user?.userId,
        action: 'settings_bulk_update',
        details: {
          success_count: results.length,
          error_count: errors.length,
          keys: Object.keys(settings),
          timestamp: new Date().toISOString()
        }
      });

    res.json({
      message: 'Bulk update completed',
      results,
      errors,
      summary: {
        total: Object.keys(settings).length,
        successful: results.length,
        failed: errors.length
      }
    });
  } catch (error) {
    console.error('Error in bulk update settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get VAPI settings specifically (includes decryption for authorized users)
router.get('/vapi/credentials', async (req: AuthenticatedRequest, res: express.Response) => {
  try {
    const { user } = req;
    const organizationId = user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({ error: 'User not associated with organization' });
    }

    const { data: vapiSettings, error } = await supabase
      .from('organization_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .in('key', ['vapi_api_key', 'vapi_webhook_secret', 'vapi_phone_numbers', 'vapi_assistants']);

    if (error) {
      console.error('Error fetching VAPI settings:', error);
      return res.status(500).json({ error: 'Failed to fetch VAPI settings' });
    }

    const credentials = {};
    vapiSettings?.forEach(setting => {
      if (setting.encrypted && user?.role === 'client_admin') {
        // Decrypt for admin users
        try {
          credentials[setting.key] = JSON.parse(
            Buffer.from(setting.value, 'base64').toString()
          );
        } catch (e) {
          credentials[setting.key] = '[DECRYPTION_ERROR]';
        }
      } else {
        credentials[setting.key] = setting.encrypted ? '[ENCRYPTED]' : setting.value;
      }
    });

    res.json({
      credentials,
      hasApiKey: !!credentials.vapi_api_key,
      hasWebhookSecret: !!credentials.vapi_webhook_secret,
      phoneNumbers: credentials.vapi_phone_numbers || [],
      assistants: credentials.vapi_assistants || []
    });
  } catch (error) {
    console.error('Error in get VAPI credentials:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;