import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Server-side encryption key - should be from environment in production
// Ensure key is exactly 32 bytes (256 bits) for AES-256
const ENCRYPTION_KEY = process.env.API_ENCRYPTION_KEY ? 
  Buffer.from(process.env.API_ENCRYPTION_KEY, 'hex') : 
  crypto.randomBytes(32);

interface ApiConfiguration {
  id?: string;
  organization_id: string;
  service_name: 'stripe' | 'openai' | 'supabase';
  configuration: Record<string, any>;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

// Encryption utilities using modern crypto functions
function encrypt(text: string): string {
  if (!text) return '';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 2) return '';
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return '';
  }
}

function encryptConfiguration(config: Record<string, any>): Record<string, any> {
  const encrypted = { ...config };
  const sensitiveFields = ['publicKey', 'secretKey', 'webhookSecret', 'apiKey', 'organizationId', 'anonKey', 'serviceRoleKey'];
  
  for (const field of sensitiveFields) {
    if (encrypted[field] && typeof encrypted[field] === 'string') {
      encrypted[field] = encrypt(encrypted[field]);
    }
  }
  
  return encrypted;
}

function decryptConfiguration(config: Record<string, any>): Record<string, any> {
  const decrypted = { ...config };
  const sensitiveFields = ['publicKey', 'secretKey', 'webhookSecret', 'apiKey', 'organizationId', 'anonKey', 'serviceRoleKey'];
  
  for (const field of sensitiveFields) {
    if (decrypted[field] && typeof decrypted[field] === 'string') {
      decrypted[field] = decrypt(decrypted[field]);
    }
  }
  
  return decrypted;
}

// Validation functions
function validateStripeConfig(config: any): boolean {
  const hasRequiredFields = !!(config.publicKey && config.secretKey);
  const validPublicKey = config.publicKey.startsWith('pk_');
  const validSecretKey = config.secretKey.startsWith('sk_');
  return hasRequiredFields && validPublicKey && validSecretKey;
}

function validateOpenAIConfig(config: any): boolean {
  const hasApiKey = !!config.apiKey;
  const validApiKey = config.apiKey.startsWith('sk-');
  return hasApiKey && validApiKey;
}

function validateSupabaseConfig(config: any): boolean {
  const hasRequiredFields = !!(config.url && config.anonKey);
  const validUrl = config.url.includes('supabase') || config.url.startsWith('http');
  const validAnonKey = config.anonKey.length > 10; // More flexible validation
  return hasRequiredFields && validUrl && validAnonKey;
}

function validateConfiguration(serviceName: string, config: any): boolean {
  switch (serviceName) {
    case 'stripe':
      return validateStripeConfig(config);
    case 'openai':
      return validateOpenAIConfig(config);
    case 'supabase':
      return validateSupabaseConfig(config);
    default:
      return false;
  }
}

// Get API configuration
export async function getApiConfiguration(req: Request, res: Response) {
  try {
    const { serviceName } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!serviceName) {
      return res.status(400).json({ error: 'Service name is required' });
    }

    // Check user permissions - platform owner only based on email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, role, email')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(403).json({ error: 'User not found' });
    }

    // Only Sean (platform owner) can manage API configurations
    if (user.email !== 'sean@artificialmedia.co.uk' || user.role !== 'platform_owner') {
      return res.status(403).json({ error: 'Access denied: Only platform owner can manage API configurations' });
    }

    // Get configuration directly from table
    const { data, error } = await supabase
      .from('api_configurations')
      .select('configuration')
      .eq('user_id', userId)
      .eq('service_name', serviceName)
      .single();

    if (error) {
      console.error('Error fetching API configuration:', error);
      return res.status(500).json({ error: 'Failed to fetch configuration' });
    }

    if (!data || Object.keys(data).length === 0) {
      return res.json({});
    }

    const decryptedConfig = decryptConfiguration(data?.configuration || {});
    res.json(decryptedConfig);

  } catch (error) {
    console.error('Error in getApiConfiguration:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Save API configuration
export async function saveApiConfiguration(req: Request, res: Response) {
  try {
    const { serviceName } = req.params;
    const { configuration } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!serviceName || !configuration) {
      return res.status(400).json({ error: 'Service name and configuration are required' });
    }

    // Validate service name
    if (!['stripe', 'openai', 'supabase'].includes(serviceName)) {
      return res.status(400).json({ error: 'Invalid service name' });
    }

    // Check user permissions - platform owner only based on email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, role, email')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(403).json({ error: 'User not found' });
    }

    // Only Sean (platform owner) can manage API configurations
    if (user.email !== 'sean@artificialmedia.co.uk' || user.role !== 'platform_owner') {
      return res.status(403).json({ error: 'Access denied: Only platform owner can manage API configurations' });
    }

    // Validate configuration
    if (!validateConfiguration(serviceName, configuration)) {
      return res.status(400).json({ error: 'Invalid configuration values' });
    }

    // Encrypt sensitive data
    const encryptedConfig = encryptConfiguration(configuration);

    // Save configuration directly to table
    const { data, error } = await supabase
      .from('api_configurations')
      .upsert({
        user_id: userId,
        service_name: serviceName,
        configuration: encryptedConfig
      }, {
        onConflict: 'user_id,service_name'
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error saving API configuration:', error);
      return res.status(500).json({ error: 'Failed to save configuration' });
    }

    res.json({ id: data?.id, message: 'Configuration saved successfully' });

  } catch (error) {
    console.error('Error in saveApiConfiguration:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Get all API configurations for the current user
export async function getAllApiConfigurations(req: Request, res: Response) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check user permissions - platform owner only based on email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, role, email')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(403).json({ error: 'User not found' });
    }

    // Only Sean (platform owner) can manage API configurations
    if (user.email !== 'sean@artificialmedia.co.uk' || user.role !== 'platform_owner') {
      return res.status(403).json({ error: 'Access denied: Only platform owner can manage API configurations' });
    }

    // Get all configurations for this user
    const { data: configs, error } = await supabase
      .from('api_configurations')
      .select('service_name, configuration')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching configurations:', error);
      return res.status(500).json({ error: 'Failed to fetch configurations' });
    }

    // Build result object
    const services = ['stripe', 'openai', 'supabase'];
    const results = services.map(service => {
      const config = configs?.find(c => c.service_name === service);
      if (config) {
        return { [service]: decryptConfiguration(config.configuration) };
      }
      return { [service]: null };
    });

    const allConfigs = results.reduce((acc, curr) => ({ ...acc, ...curr }), {});
    res.json(allConfigs);

  } catch (error) {
    console.error('Error in getAllApiConfigurations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Delete API configuration
export async function deleteApiConfiguration(req: Request, res: Response) {
  try {
    const { serviceName } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!serviceName) {
      return res.status(400).json({ error: 'Service name is required' });
    }

    // Check user permissions - platform owner only based on email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, role, email')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(403).json({ error: 'User not found' });
    }

    // Only Sean (platform owner) can manage API configurations
    if (user.email !== 'sean@artificialmedia.co.uk' || user.role !== 'platform_owner') {
      return res.status(403).json({ error: 'Access denied: Only platform owner can manage API configurations' });
    }

    // Delete configuration
    const { error } = await supabase
      .from('api_configurations')
      .delete()
      .eq('user_id', userId)
      .eq('service_name', serviceName);

    if (error) {
      console.error('Error deleting API configuration:', error);
      return res.status(500).json({ error: 'Failed to delete configuration' });
    }

    res.json({ message: 'Configuration deleted successfully' });

  } catch (error) {
    console.error('Error in deleteApiConfiguration:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Get audit log
export async function getConfigurationAuditLog(req: Request, res: Response) {
  try {
    const { serviceName } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check user permissions - platform owner only based on email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, role, email')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return res.status(403).json({ error: 'User not found' });
    }

    // Only Sean (platform owner) can manage API configurations
    if (user.email !== 'sean@artificialmedia.co.uk' || user.role !== 'platform_owner') {
      return res.status(403).json({ error: 'Access denied: Only platform owner can manage API configurations' });
    }

    // Build query
    let query = supabase
      .from('api_configuration_audit')
      .select('*')
      .eq('user_id', userId)
      .order('changed_at', { ascending: false });

    if (serviceName) {
      query = query.eq('service_name', serviceName);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching audit log:', error);
      return res.status(500).json({ error: 'Failed to fetch audit log' });
    }

    res.json(data || []);

  } catch (error) {
    console.error('Error in getConfigurationAuditLog:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}