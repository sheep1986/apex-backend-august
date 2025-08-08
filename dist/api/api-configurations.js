"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getApiConfiguration = getApiConfiguration;
exports.saveApiConfiguration = saveApiConfiguration;
exports.getAllApiConfigurations = getAllApiConfigurations;
exports.deleteApiConfiguration = deleteApiConfiguration;
exports.getConfigurationAuditLog = getConfigurationAuditLog;
const supabase_js_1 = require("@supabase/supabase-js");
const crypto_1 = __importDefault(require("crypto"));
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
}
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey);
const ENCRYPTION_KEY = process.env.API_ENCRYPTION_KEY ?
    Buffer.from(process.env.API_ENCRYPTION_KEY, 'hex') :
    crypto_1.default.randomBytes(32);
function encrypt(text) {
    if (!text)
        return '';
    const iv = crypto_1.default.randomBytes(16);
    const cipher = crypto_1.default.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}
function decrypt(encryptedText) {
    if (!encryptedText)
        return '';
    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 2)
            return '';
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const decipher = crypto_1.default.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    catch {
        return '';
    }
}
function encryptConfiguration(config) {
    const encrypted = { ...config };
    const sensitiveFields = ['publicKey', 'secretKey', 'webhookSecret', 'apiKey', 'organizationId', 'anonKey', 'serviceRoleKey'];
    for (const field of sensitiveFields) {
        if (encrypted[field] && typeof encrypted[field] === 'string') {
            encrypted[field] = encrypt(encrypted[field]);
        }
    }
    return encrypted;
}
function decryptConfiguration(config) {
    const decrypted = { ...config };
    const sensitiveFields = ['publicKey', 'secretKey', 'webhookSecret', 'apiKey', 'organizationId', 'anonKey', 'serviceRoleKey'];
    for (const field of sensitiveFields) {
        if (decrypted[field] && typeof decrypted[field] === 'string') {
            decrypted[field] = decrypt(decrypted[field]);
        }
    }
    return decrypted;
}
function validateStripeConfig(config) {
    const hasRequiredFields = !!(config.publicKey && config.secretKey);
    const validPublicKey = config.publicKey.startsWith('pk_');
    const validSecretKey = config.secretKey.startsWith('sk_');
    return hasRequiredFields && validPublicKey && validSecretKey;
}
function validateOpenAIConfig(config) {
    const hasApiKey = !!config.apiKey;
    const validApiKey = config.apiKey.startsWith('sk-');
    return hasApiKey && validApiKey;
}
function validateSupabaseConfig(config) {
    const hasRequiredFields = !!(config.url && config.anonKey);
    const validUrl = config.url.includes('supabase') || config.url.startsWith('http');
    const validAnonKey = config.anonKey.length > 10;
    return hasRequiredFields && validUrl && validAnonKey;
}
function validateConfiguration(serviceName, config) {
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
async function getApiConfiguration(req, res) {
    try {
        const { serviceName } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!serviceName) {
            return res.status(400).json({ error: 'Service name is required' });
        }
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, role, email')
            .eq('id', userId)
            .single();
        if (userError || !user) {
            return res.status(403).json({ error: 'User not found' });
        }
        if (user.email !== 'sean@artificialmedia.co.uk' || user.role !== 'platform_owner') {
            return res.status(403).json({ error: 'Access denied: Only platform owner can manage API configurations' });
        }
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
    }
    catch (error) {
        console.error('Error in getApiConfiguration:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}
async function saveApiConfiguration(req, res) {
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
        if (!['stripe', 'openai', 'supabase'].includes(serviceName)) {
            return res.status(400).json({ error: 'Invalid service name' });
        }
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, role, email')
            .eq('id', userId)
            .single();
        if (userError || !user) {
            return res.status(403).json({ error: 'User not found' });
        }
        if (user.email !== 'sean@artificialmedia.co.uk' || user.role !== 'platform_owner') {
            return res.status(403).json({ error: 'Access denied: Only platform owner can manage API configurations' });
        }
        if (!validateConfiguration(serviceName, configuration)) {
            return res.status(400).json({ error: 'Invalid configuration values' });
        }
        const encryptedConfig = encryptConfiguration(configuration);
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
    }
    catch (error) {
        console.error('Error in saveApiConfiguration:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}
async function getAllApiConfigurations(req, res) {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, role, email')
            .eq('id', userId)
            .single();
        if (userError || !user) {
            return res.status(403).json({ error: 'User not found' });
        }
        if (user.email !== 'sean@artificialmedia.co.uk' || user.role !== 'platform_owner') {
            return res.status(403).json({ error: 'Access denied: Only platform owner can manage API configurations' });
        }
        const { data: configs, error } = await supabase
            .from('api_configurations')
            .select('service_name, configuration')
            .eq('user_id', userId);
        if (error) {
            console.error('Error fetching configurations:', error);
            return res.status(500).json({ error: 'Failed to fetch configurations' });
        }
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
    }
    catch (error) {
        console.error('Error in getAllApiConfigurations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}
async function deleteApiConfiguration(req, res) {
    try {
        const { serviceName } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!serviceName) {
            return res.status(400).json({ error: 'Service name is required' });
        }
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, role, email')
            .eq('id', userId)
            .single();
        if (userError || !user) {
            return res.status(403).json({ error: 'User not found' });
        }
        if (user.email !== 'sean@artificialmedia.co.uk' || user.role !== 'platform_owner') {
            return res.status(403).json({ error: 'Access denied: Only platform owner can manage API configurations' });
        }
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
    }
    catch (error) {
        console.error('Error in deleteApiConfiguration:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}
async function getConfigurationAuditLog(req, res) {
    try {
        const { serviceName } = req.query;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, role, email')
            .eq('id', userId)
            .single();
        if (userError || !user) {
            return res.status(403).json({ error: 'User not found' });
        }
        if (user.email !== 'sean@artificialmedia.co.uk' || user.role !== 'platform_owner') {
            return res.status(403).json({ error: 'Access denied: Only platform owner can manage API configurations' });
        }
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
    }
    catch (error) {
        console.error('Error in getConfigurationAuditLog:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}
