"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.vapiService = exports.VapiService = void 0;
const axios_1 = __importDefault(require("axios"));
class VapiService {
    constructor(apiKey, organizationId) {
        this.apiKey = apiKey || process.env.VAPI_API_KEY || '';
        this.organizationId = organizationId;
        if (!this.apiKey) {
            console.warn('⚠️ VAPI API key not provided - service will not function');
        }
        this.api = axios_1.default.create({
            baseURL: 'https://api.vapi.ai',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        this.api.interceptors.request.use((config) => {
            console.log(`🔵 VAPI Request: ${config.method?.toUpperCase()} ${config.url}`);
            return config;
        }, (error) => {
            console.error('❌ VAPI Request Error:', error);
            return Promise.reject(error);
        });
        this.api.interceptors.response.use((response) => {
            console.log(`🟢 VAPI Response: ${response.status} ${response.config.url}`);
            return response;
        }, (error) => {
            console.error('❌ VAPI Response Error:', {
                status: error.response?.status,
                statusText: error.response?.statusText,
                url: error.config?.url,
                data: error.response?.data
            });
            return Promise.reject(error);
        });
    }
    async createCall(request) {
        try {
            const callRequest = {
                ...request,
                recordingEnabled: request.recordingEnabled ?? true,
                transcriptionEnabled: request.transcriptionEnabled ?? true
            };
            const response = await this.api.post('/call', callRequest);
            return response.data;
        }
        catch (error) {
            console.error('❌ Error creating VAPI call:', error);
            throw new Error(`Failed to create call: ${error.response?.data?.message || error.message}`);
        }
    }
    async getCall(callId) {
        try {
            const response = await this.api.get(`/call/${callId}`);
            return response.data;
        }
        catch (error) {
            console.error('❌ Error getting VAPI call:', error);
            throw new Error(`Failed to get call: ${error.response?.data?.message || error.message}`);
        }
    }
    async listCalls(params) {
        try {
            const response = await this.api.get('/call', { params });
            return response.data;
        }
        catch (error) {
            console.error('❌ Error listing VAPI calls:', error);
            throw new Error(`Failed to list calls: ${error.response?.data?.message || error.message}`);
        }
    }
    async getAssistants() {
        try {
            const response = await this.api.get('/assistant');
            return response.data;
        }
        catch (error) {
            console.error('❌ Error getting VAPI assistants:', error);
            throw new Error(`Failed to get assistants: ${error.response?.data?.message || error.message}`);
        }
    }
    async getAssistant(assistantId) {
        try {
            const response = await this.api.get(`/assistant/${assistantId}`);
            return response.data;
        }
        catch (error) {
            console.error('❌ Error getting VAPI assistant:', error);
            throw new Error(`Failed to get assistant: ${error.response?.data?.message || error.message}`);
        }
    }
    async getPhoneNumbers() {
        try {
            const response = await this.api.get('/phone-numbers');
            return response.data;
        }
        catch (error) {
            console.error('❌ Error getting VAPI phone numbers:', error);
            throw new Error(`Failed to get phone numbers: ${error.response?.data?.message || error.message}`);
        }
    }
    async getPhoneNumber(phoneNumberId) {
        try {
            const response = await this.api.get(`/phone-number/${phoneNumberId}`);
            return response.data;
        }
        catch (error) {
            console.error('❌ Error getting VAPI phone number:', error);
            throw new Error(`Failed to get phone number: ${error.response?.data?.message || error.message}`);
        }
    }
    async createScheduledCall(request) {
        try {
            const response = await this.api.post('/call', request);
            return response.data;
        }
        catch (error) {
            console.error('❌ Error creating scheduled VAPI call:', error);
            throw new Error(`Failed to create scheduled call: ${error.response?.data?.message || error.message}`);
        }
    }
    async getOrganization() {
        try {
            const response = await this.api.get('/org');
            return response.data;
        }
        catch (error) {
            console.error('❌ Error getting VAPI organization:', error);
            throw new Error(`Failed to get organization: ${error.response?.data?.message || error.message}`);
        }
    }
    async healthCheck() {
        try {
            await this.api.get('/org');
            return true;
        }
        catch (error) {
            console.error('❌ VAPI health check failed:', error);
            return false;
        }
    }
    formatPhoneNumber(phone) {
        const digits = phone.replace(/\D/g, '');
        if (digits.length === 10) {
            return `+1${digits}`;
        }
        else if (digits.length === 11 && digits.startsWith('1')) {
            return `+${digits}`;
        }
        else if (!digits.startsWith('+')) {
            return `+${digits}`;
        }
        return digits;
    }
    validateCallRequest(request) {
        const errors = [];
        if (!request.assistantId) {
            errors.push('Assistant ID is required');
        }
        if (!request.phoneNumberId) {
            errors.push('Phone number ID is required');
        }
        if (!request.customer?.number) {
            errors.push('Customer phone number is required');
        }
        else {
            const phone = request.customer.number;
            if (!/^\+?[1-9]\d{1,14}$/.test(phone.replace(/\D/g, ''))) {
                errors.push('Invalid customer phone number format');
            }
        }
        return errors;
    }
    async getConcurrencyLimits() {
        try {
            const org = await this.getOrganization();
            const activeCalls = await this.listCalls({
                limit: 100,
                createdAtGt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            });
            const currentConcurrent = activeCalls.filter(call => call.status === 'ringing' || call.status === 'in-progress').length;
            const maxConcurrent = org.concurrencyLimit || 10;
            return {
                maxConcurrentCalls: maxConcurrent,
                currentConcurrentCalls: currentConcurrent,
                availableSlots: Math.max(0, maxConcurrent - currentConcurrent)
            };
        }
        catch (error) {
            console.error('❌ Error getting concurrency limits:', error);
            return {
                maxConcurrentCalls: 1,
                currentConcurrentCalls: 0,
                availableSlots: 1
            };
        }
    }
    async canMakeCall() {
        try {
            const limits = await this.getConcurrencyLimits();
            return limits.availableSlots > 0;
        }
        catch (error) {
            console.error('❌ Error checking if can make call:', error);
            return false;
        }
    }
    static async forOrganization(organizationId) {
        try {
            console.log(`🔍 Creating VAPI service for organization: ${organizationId}`);
            const supabase = (await Promise.resolve().then(() => __importStar(require('./supabase-client')))).default;
            const { data: organization, error: orgError } = await supabase
                .from('organizations')
                .select('settings, vapi_api_key, vapi_settings')
                .eq('id', organizationId)
                .single();
            if (organization && !orgError) {
                let vapiCredentials = null;
                if (organization.settings?.vapi?.apiKey) {
                    vapiCredentials = organization.settings.vapi;
                    console.log('✅ Found VAPI credentials in organizations.settings.vapi');
                }
                else if (organization.vapi_settings) {
                    try {
                        vapiCredentials = JSON.parse(organization.vapi_settings);
                        console.log('✅ Found VAPI credentials in organizations.vapi_settings');
                    }
                    catch (parseError) {
                        console.log('⚠️ Could not parse vapi_settings column');
                    }
                }
                else if (organization.vapi_api_key) {
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
                }
                catch (parseError) {
                    console.log('⚠️ Could not parse organization_settings VAPI credentials');
                }
            }
            console.log(`⚠️ No valid VAPI credentials found for organization: ${organizationId}`);
            return null;
        }
        catch (error) {
            console.error('❌ Error creating organization VAPI service:', error);
            return null;
        }
    }
    getOrganizationId() {
        return this.organizationId;
    }
    updateApiKey(newApiKey) {
        this.apiKey = newApiKey;
        this.api.defaults.headers['Authorization'] = `Bearer ${newApiKey}`;
    }
    async fetchRecordingUrl(callId) {
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
        }
        catch (error) {
            console.error(`❌ Error fetching recording URL for call ${callId}:`, error);
            return null;
        }
    }
}
exports.VapiService = VapiService;
exports.vapiService = new VapiService();
