"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiConfigManager = void 0;
exports.getAPIConfigManager = getAPIConfigManager;
const supabase_js_1 = require("@supabase/supabase-js");
const stripe_1 = __importDefault(require("stripe"));
const openai_1 = __importDefault(require("openai"));
const supabase_client_1 = __importDefault(require("./supabase-client"));
const crypto_1 = __importDefault(require("crypto"));
class APIConfigManager {
    constructor() {
        this.apis = {};
        this.userId = null;
        this.encryptionKey = process.env.API_ENCRYPTION_KEY ?
            Buffer.from(process.env.API_ENCRYPTION_KEY, 'hex') :
            crypto_1.default.randomBytes(32);
    }
    async initialize(userId) {
        this.userId = userId;
        await this.loadConfigurations();
    }
    decrypt(encryptedText) {
        if (!encryptedText)
            return '';
        try {
            const parts = encryptedText.split(':');
            if (parts.length !== 2)
                return '';
            const iv = Buffer.from(parts[0], 'hex');
            const encrypted = parts[1];
            const decipher = crypto_1.default.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        }
        catch {
            return '';
        }
    }
    async loadConfigurations() {
        if (!this.userId)
            throw new Error('User ID not set');
        try {
            const { data: configs, error } = await supabase_client_1.default
                .from('api_configurations')
                .select('service_name, configuration')
                .eq('user_id', this.userId);
            if (error)
                throw error;
            for (const config of configs || []) {
                await this.initializeService(config.service_name, config.configuration);
            }
        }
        catch (error) {
            console.error('Error loading API configurations:', error);
        }
    }
    async initializeService(serviceName, encryptedConfig) {
        try {
            switch (serviceName) {
                case 'stripe':
                    const stripeConfig = this.decryptConfig(encryptedConfig);
                    if (stripeConfig.secretKey) {
                        this.apis.stripe = new stripe_1.default(stripeConfig.secretKey, {
                            apiVersion: '2023-10-16',
                        });
                        console.log('✅ Stripe API initialized');
                    }
                    break;
                case 'openai':
                    const openaiConfig = this.decryptConfig(encryptedConfig);
                    if (openaiConfig.apiKey) {
                        this.apis.openai = new openai_1.default({
                            apiKey: openaiConfig.apiKey,
                            organization: openaiConfig.organizationId,
                        });
                        console.log('✅ OpenAI API initialized');
                    }
                    break;
                case 'supabase':
                    const supabaseConfig = this.decryptConfig(encryptedConfig);
                    if (supabaseConfig.url && supabaseConfig.anonKey) {
                        this.apis.externalSupabase = (0, supabase_js_1.createClient)(supabaseConfig.url, supabaseConfig.anonKey);
                        console.log('✅ External Supabase client initialized');
                    }
                    break;
            }
        }
        catch (error) {
            console.error(`Error initializing ${serviceName}:`, error);
        }
    }
    decryptConfig(config) {
        const decrypted = {};
        const sensitiveFields = ['publicKey', 'secretKey', 'webhookSecret', 'apiKey', 'organizationId', 'anonKey', 'serviceRoleKey'];
        for (const [key, value] of Object.entries(config)) {
            if (sensitiveFields.includes(key) && typeof value === 'string') {
                decrypted[key] = this.decrypt(value);
            }
            else {
                decrypted[key] = value;
            }
        }
        return decrypted;
    }
    getStripe() {
        if (!this.apis.stripe) {
            console.warn('Stripe not initialized. Check API configuration.');
            return null;
        }
        return this.apis.stripe;
    }
    getOpenAI() {
        if (!this.apis.openai) {
            console.warn('OpenAI not initialized. Check API configuration.');
            return null;
        }
        return this.apis.openai;
    }
    getExternalSupabase() {
        if (!this.apis.externalSupabase) {
            console.warn('External Supabase not initialized. Check API configuration.');
            return null;
        }
        return this.apis.externalSupabase;
    }
    async refresh() {
        this.apis = {};
        await this.loadConfigurations();
    }
    isConfigured(serviceName) {
        switch (serviceName) {
            case 'stripe':
                return !!this.apis.stripe;
            case 'openai':
                return !!this.apis.openai;
            case 'supabase':
                return !!this.apis.externalSupabase;
            default:
                return false;
        }
    }
}
exports.apiConfigManager = new APIConfigManager();
async function getAPIConfigManager(userId) {
    const manager = new APIConfigManager();
    await manager.initialize(userId);
    return manager;
}
