"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VAPIIntegrationService = void 0;
const axios_1 = __importDefault(require("axios"));
const supabase_client_1 = __importDefault(require("./supabase-client"));
class VAPIIntegrationService {
    constructor(config) {
        this.config = config;
        this.client = axios_1.default.create({
            baseURL: 'https://api.vapi.ai',
            headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000,
            validateStatus: (status) => status < 500
        });
    }
    static async forOrganization(organizationId) {
        try {
            console.log('🔄 Checking organizations table for VAPI credentials...');
            const { data: organization, error: orgError } = await supabase_client_1.default
                .from('organizations')
                .select('settings, vapi_api_key, vapi_private_key, vapi_settings')
                .eq('id', organizationId)
                .single();
            if (organization && !orgError) {
                let vapiSettings = null;
                if (organization.settings?.vapi) {
                    vapiSettings = organization.settings.vapi;
                    console.log('✅ Found VAPI credentials in organizations.settings.vapi');
                }
                else if (organization.vapi_settings) {
                    try {
                        vapiSettings = JSON.parse(organization.vapi_settings);
                        console.log('✅ Found VAPI credentials in organizations.vapi_settings');
                    }
                    catch (parseError) {
                        console.log('⚠️ Could not parse vapi_settings column');
                    }
                }
                else if (organization.vapi_private_key || organization.vapi_api_key) {
                    vapiSettings = {
                        apiKey: organization.vapi_private_key || organization.vapi_api_key,
                        privateKey: organization.vapi_private_key || organization.vapi_api_key,
                        publicKey: organization.vapi_api_key,
                        webhookUrl: 'https://api.apexai.com/webhooks/vapi',
                        enabled: true
                    };
                    console.log('✅ Found VAPI credentials in organizations columns - using vapi_private_key for API');
                }
                if (vapiSettings && vapiSettings.apiKey) {
                    if (vapiSettings.enabled === false) {
                        console.log('⚠️ VAPI integration is disabled for this organization');
                        return null;
                    }
                    console.log('🎯 Creating VAPI service with credentials:', {
                        hasApiKey: !!vapiSettings.apiKey,
                        apiKeyPreview: vapiSettings.apiKey ? vapiSettings.apiKey.substring(0, 10) + '...' : 'NO KEY',
                        organizationId,
                        source: 'organizations table'
                    });
                    const config = {
                        apiKey: vapiSettings.apiKey,
                        organizationId,
                        webhookSecret: vapiSettings.webhookUrl || 'https://api.apexai.com/webhooks/vapi'
                    };
                    return new VAPIIntegrationService(config);
                }
            }
            console.log('🔄 Checking organization_settings for VAPI credentials...');
            const { data: settings, error: settingsError } = await supabase_client_1.default
                .from('organization_settings')
                .select('setting_value')
                .eq('organization_id', organizationId)
                .eq('setting_key', 'vapi_credentials')
                .single();
            if (settingsError || !settings) {
                console.log('⚠️ No VAPI credentials found for organization');
                return null;
            }
            const credentials = JSON.parse(settings.setting_value);
            if (!credentials.apiKey) {
                console.log('⚠️ Invalid VAPI credentials format');
                return null;
            }
            if (credentials.enabled === false) {
                console.log('⚠️ VAPI integration is disabled for this organization');
                return null;
            }
            console.log('✅ Found VAPI credentials in organization_settings');
            const config = {
                apiKey: credentials.apiKey,
                organizationId,
                webhookSecret: credentials.webhookSecret
            };
            return new VAPIIntegrationService(config);
        }
        catch (error) {
            console.error('❌ Error fetching VAPI credentials:', error);
            return null;
        }
    }
    static async getOrganizationVAPIConfig(organizationId) {
        try {
            const { data: org, error: orgError } = await supabase_client_1.default
                .from('organizations')
                .select('vapi_api_key, vapi_assistant_id, vapi_phone_number_id, vapi_webhook_url, vapi_settings')
                .eq('id', organizationId)
                .single();
            if (!orgError && org?.vapi_api_key) {
                const settings = org.vapi_settings ? JSON.parse(org.vapi_settings) : {};
                return {
                    hasCredentials: true,
                    apiKey: org.vapi_api_key ? '***' + org.vapi_api_key.slice(-4) : null,
                    assistantId: org.vapi_assistant_id,
                    phoneNumberId: org.vapi_phone_number_id,
                    webhookUrl: org.vapi_webhook_url,
                    configuredAt: settings.configured_at,
                    lastTested: settings.lastTested,
                    testResults: settings.testResults
                };
            }
            const { data: settings, error: settingsError } = await supabase_client_1.default
                .from('organization_settings')
                .select('setting_value, updated_at')
                .eq('organization_id', organizationId)
                .eq('setting_key', 'vapi_credentials')
                .single();
            if (settingsError || !settings) {
                return { hasCredentials: false };
            }
            const credentials = JSON.parse(settings.setting_value);
            return {
                hasCredentials: true,
                apiKey: credentials.apiKey ? '***' + credentials.apiKey.slice(-4) : null,
                configuredAt: credentials.configured_at,
                lastTested: credentials.lastTested,
                testResults: credentials.testResults,
                updatedAt: settings.updated_at
            };
        }
        catch (error) {
            console.error('Error fetching VAPI config:', error);
            return { hasCredentials: false, error: error.message };
        }
    }
    async createAssistant(assistant) {
        try {
            const response = await this.client.post('/assistant', assistant);
            await supabase_client_1.default
                .from('vapi_assistants')
                .insert({
                organization_id: this.config.organizationId,
                vapi_assistant_id: response.data.id,
                name: assistant.name,
                type: 'outbound',
                config: assistant,
                voice_id: assistant.voice?.voiceId,
                first_message: assistant.firstMessage,
                system_prompt: assistant.model?.systemPrompt,
                is_active: true
            });
            return response.data;
        }
        catch (error) {
            console.error('Error creating VAPI assistant:', error);
            throw error;
        }
    }
    async updateAssistant(assistantId, updates) {
        try {
            const response = await this.client.patch(`/assistant/${assistantId}`, updates);
            await supabase_client_1.default
                .from('vapi_assistants')
                .update({
                config: updates,
                updated_at: new Date().toISOString()
            })
                .eq('vapi_assistant_id', assistantId)
                .eq('organization_id', this.config.organizationId);
            return response.data;
        }
        catch (error) {
            console.error('Error updating VAPI assistant:', error);
            throw error;
        }
    }
    async listAssistants() {
        try {
            console.log('🔍 Making VAPI API call to list assistants...');
            console.log('🔑 Using API key:', this.config.apiKey ? this.config.apiKey.substring(0, 10) + '...' : 'NO KEY');
            console.log('📍 API Base URL:', this.client.defaults.baseURL);
            console.log('🔐 Auth Header:', this.client.defaults.headers['Authorization'] ? 'Bearer ***' : 'NO AUTH');
            try {
                const response = await this.client.get('/assistant');
                console.log('✅ VAPI assistants API response:', {
                    status: response.status,
                    dataLength: Array.isArray(response.data) ? response.data.length : 'not array',
                    dataPreview: Array.isArray(response.data) ? `${response.data.length} assistants` : 'not array',
                    rawData: response.data
                });
                if (Array.isArray(response.data) && response.data.length === 0) {
                    console.log('⚠️ VAPI returned empty assistants array');
                    console.log('💡 This could mean:');
                    console.log('   1. No assistants created in VAPI dashboard');
                    console.log('   2. Using wrong API key (public vs private)');
                    console.log('   3. Assistants are under a different account');
                }
                return response.data || [];
            }
            catch (axiosError) {
                console.error('⚠️ Axios request failed, trying native HTTPS...', axiosError.message);
                const https = require('https');
                return new Promise((resolve, reject) => {
                    const options = {
                        hostname: 'api.vapi.ai',
                        port: 443,
                        path: '/assistant',
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${this.config.apiKey}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        }
                    };
                    const req = https.request(options, (res) => {
                        let data = '';
                        res.on('data', (chunk) => data += chunk);
                        res.on('end', () => {
                            if (res.statusCode === 200) {
                                try {
                                    const assistants = JSON.parse(data);
                                    console.log('✅ Native HTTPS success! Retrieved', assistants.length, 'assistants');
                                    resolve(assistants);
                                }
                                catch (e) {
                                    reject(new Error('Failed to parse response'));
                                }
                            }
                            else {
                                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                            }
                        });
                    });
                    req.on('error', (error) => {
                        console.error('❌ Native HTTPS also failed:', error.message);
                        reject(error);
                    });
                    req.end();
                });
            }
        }
        catch (error) {
            console.error('❌ Error listing VAPI assistants:', error.message);
            throw error;
        }
    }
    async deleteAssistant(assistantId) {
        try {
            await this.client.delete(`/assistant/${assistantId}`);
            await supabase_client_1.default
                .from('vapi_assistants')
                .update({ is_active: false })
                .eq('vapi_assistant_id', assistantId)
                .eq('organization_id', this.config.organizationId);
        }
        catch (error) {
            console.error('Error deleting VAPI assistant:', error);
            throw error;
        }
    }
    async createCall(call) {
        try {
            const response = await this.client.post('/call', call);
            await supabase_client_1.default
                .from('calls')
                .insert({
                organization_id: this.config.organizationId,
                vapi_call_id: response.data.id,
                to_number: call.phoneNumber || call.customer?.number,
                direction: 'outbound',
                status: 'queued',
                started_at: new Date().toISOString()
            });
            return response.data;
        }
        catch (error) {
            console.error('Error creating VAPI call:', error);
            throw error;
        }
    }
    async getCall(callId) {
        try {
            const response = await this.client.get(`/call/${callId}`);
            return response.data;
        }
        catch (error) {
            console.error('Error getting VAPI call:', error);
            throw error;
        }
    }
    async listCalls(filters) {
        try {
            const response = await this.client.get('/call', { params: filters });
            return response.data;
        }
        catch (error) {
            console.error('Error listing VAPI calls:', error);
            throw error;
        }
    }
    async createCampaign(campaign) {
        try {
            const response = await this.client.post('/campaign', campaign);
            await supabase_client_1.default
                .from('campaigns')
                .insert({
                organization_id: this.config.organizationId,
                name: campaign.name,
                type: 'outbound',
                status: 'active',
                assistant_id: campaign.assistantId,
                phone_number_id: campaign.phoneNumberId,
                settings: {
                    customers: campaign.customers,
                    schedule: campaign.schedulePlan
                }
            });
            return response.data;
        }
        catch (error) {
            console.error('Error creating VAPI campaign:', error);
            throw error;
        }
    }
    async handleWebhook(payload) {
        const { type, call, assistant, phoneNumber } = payload;
        switch (type) {
            case 'call-started':
                await this.handleCallStarted(call);
                break;
            case 'call-ended':
                await this.handleCallEnded(call);
                break;
            case 'speech-update':
                await this.handleSpeechUpdate(call, payload);
                break;
            case 'function-call':
                await this.handleFunctionCall(call, payload);
                break;
            case 'hang':
                await this.handleHang(call);
                break;
            case 'transfer-destination-request':
                return this.handleTransferRequest(call, payload);
            default:
                console.log('Unhandled webhook type:', type);
        }
    }
    async handleCallStarted(call) {
        await supabase_client_1.default
            .from('calls')
            .update({
            status: 'in-progress',
            started_at: call.startedAt
        })
            .eq('vapi_call_id', call.id);
    }
    async handleCallEnded(call) {
        const { id, endedAt, duration, endedReason, cost, transcript, summary } = call;
        await supabase_client_1.default
            .from('calls')
            .update({
            status: 'completed',
            ended_at: endedAt,
            duration,
            end_reason: endedReason,
            cost,
            transcript,
            summary
        })
            .eq('vapi_call_id', id);
        if (call.campaignId) {
            await supabase_client_1.default.rpc('increment_campaign_metrics', {
                campaign_id: call.campaignId,
                calls: 1,
                duration: duration,
                successful: endedReason === 'hangup' ? 1 : 0
            });
        }
    }
    async handleSpeechUpdate(call, payload) {
        const { role, message, transcript } = payload;
        await supabase_client_1.default
            .from('call_transcripts')
            .insert({
            call_id: call.id,
            role,
            message,
            transcript,
            timestamp: new Date().toISOString()
        });
    }
    async handleFunctionCall(call, payload) {
        const { functionCall } = payload;
        switch (functionCall.name) {
            case 'transferCall':
                return this.handleTransferCall(call, functionCall.parameters);
            case 'endCall':
                return { status: 'ok' };
            case 'bookAppointment':
                return this.handleBookAppointment(call, functionCall.parameters);
            default:
                console.log('Unhandled function call:', functionCall.name);
                return { error: 'Function not implemented' };
        }
    }
    async handleHang(call) {
        await supabase_client_1.default
            .from('calls')
            .update({
            status: 'hung-up',
            ended_at: new Date().toISOString()
        })
            .eq('vapi_call_id', call.id);
    }
    async handleTransferRequest(call, payload) {
        return {
            destination: {
                type: 'number',
                number: '+1234567890'
            }
        };
    }
    async handleTransferCall(call, parameters) {
        return {
            status: 'transferred',
            destination: parameters.destination
        };
    }
    async handleBookAppointment(call, parameters) {
        const { date, time, name, reason } = parameters;
        await supabase_client_1.default
            .from('appointments')
            .insert({
            call_id: call.id,
            date,
            time,
            name,
            reason,
            created_at: new Date().toISOString()
        });
        return {
            status: 'booked',
            confirmationNumber: `APT-${Date.now()}`
        };
    }
    async getPhoneNumbers() {
        try {
            console.log('🔍 Making VAPI API call to list phone numbers...');
            console.log('🔑 Using API key:', this.config.apiKey ? this.config.apiKey.substring(0, 10) + '...' : 'NO KEY');
            console.log('📍 API Base URL:', this.client.defaults.baseURL);
            console.log('🔐 Auth Header:', this.client.defaults.headers['Authorization'] ? 'Bearer ***' : 'NO AUTH');
            try {
                const response = await this.client.get('/phone-number');
                console.log('✅ VAPI phone numbers API response:', {
                    status: response.status,
                    dataLength: Array.isArray(response.data) ? response.data.length : 'not array',
                    dataPreview: Array.isArray(response.data) ? `${response.data.length} phone numbers` : 'not array',
                    rawData: response.data
                });
                if (Array.isArray(response.data) && response.data.length === 0) {
                    console.log('⚠️ VAPI returned empty phone numbers array');
                    console.log('💡 This could mean:');
                    console.log('   1. No phone numbers purchased in VAPI dashboard');
                    console.log('   2. Using wrong API key (public vs private)');
                    console.log('   3. Phone numbers are under a different account');
                }
                return response.data || [];
            }
            catch (axiosError) {
                console.error('⚠️ Axios request failed, trying native HTTPS...', axiosError.message);
                const https = require('https');
                return new Promise((resolve, reject) => {
                    const options = {
                        hostname: 'api.vapi.ai',
                        port: 443,
                        path: '/phone-number',
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${this.config.apiKey}`,
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        }
                    };
                    const req = https.request(options, (res) => {
                        let data = '';
                        res.on('data', (chunk) => data += chunk);
                        res.on('end', () => {
                            if (res.statusCode === 200) {
                                try {
                                    const phoneNumbers = JSON.parse(data);
                                    console.log('✅ Native HTTPS success! Retrieved', phoneNumbers.length, 'phone numbers');
                                    resolve(phoneNumbers);
                                }
                                catch (e) {
                                    reject(new Error('Failed to parse response'));
                                }
                            }
                            else {
                                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                            }
                        });
                    });
                    req.on('error', (error) => {
                        console.error('❌ Native HTTPS also failed:', error.message);
                        reject(error);
                    });
                    req.end();
                });
            }
        }
        catch (error) {
            console.error('❌ Error getting phone numbers:', error.message);
            throw error;
        }
    }
    async buyPhoneNumber(areaCode, name) {
        try {
            const response = await this.client.post('/phone-numbers/buy', {
                areaCode,
                name
            });
            return response.data;
        }
        catch (error) {
            console.error('Error buying phone number:', error);
            throw error;
        }
    }
    async createWorkflow(workflow) {
        try {
            const response = await this.client.post('/workflow', workflow);
            return response.data;
        }
        catch (error) {
            console.error('Error creating workflow:', error);
            throw error;
        }
    }
    async getAnalytics(filters) {
        try {
            const { data: calls } = await supabase_client_1.default
                .from('calls')
                .select('*')
                .eq('organization_id', this.config.organizationId)
                .gte('started_at', filters.startDate)
                .lte('started_at', filters.endDate);
            const totalCalls = calls?.length || 0;
            const totalDuration = calls?.reduce((sum, call) => sum + (call.duration || 0), 0) || 0;
            const avgDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;
            const completedCalls = calls?.filter(c => c.status === 'completed').length || 0;
            const completionRate = totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 0;
            return {
                totalCalls,
                totalDuration,
                avgDuration,
                completedCalls,
                completionRate,
                costTotal: calls?.reduce((sum, call) => sum + (call.cost || 0), 0) || 0
            };
        }
        catch (error) {
            console.error('Error getting analytics:', error);
            throw error;
        }
    }
    async generateQualificationScript(campaignName, qualificationFields, winningCriteria) {
        const requiredFields = qualificationFields.filter(f => f.is_required);
        const highValueFields = qualificationFields.filter(f => f.scoring_weight >= 70);
        let systemPrompt = `You are a professional sales representative for ${campaignName}. Your goal is to qualify leads based on specific criteria while maintaining a natural, friendly conversation.

MAIN OBJECTIVE: ${winningCriteria.mainCriteria || 'Qualify leads for our solution'}

QUALIFICATION CRITERIA:`;
        if (requiredFields.length > 0) {
            systemPrompt += '\n\nREQUIRED INFORMATION (Must capture):';
            requiredFields.forEach(field => {
                systemPrompt += `\n- ${field.field_name}: Listen for ${field.ai_detection_hints.slice(0, 3).join(', ')}`;
            });
        }
        if (highValueFields.length > 0) {
            systemPrompt += '\n\nHIGH PRIORITY (Try to capture):';
            highValueFields.forEach(field => {
                systemPrompt += `\n- ${field.field_name} (${field.scoring_weight}% importance)`;
            });
        }
        if (winningCriteria.requireCompanySize) {
            systemPrompt += `\n\nCOMPANY SIZE: Must have at least ${winningCriteria.minCompanySize} employees`;
        }
        if (winningCriteria.requireBudget) {
            systemPrompt += '\n\nBUDGET: Explore their budget for this type of solution';
        }
        if (winningCriteria.disqualifiers) {
            systemPrompt += `\n\nDISQUALIFIERS (End call politely if detected):\n${winningCriteria.disqualifiers}`;
        }
        systemPrompt += `

CONVERSATION GUIDELINES:
1. Be conversational and natural - this is not an interrogation
2. Ask open-ended questions to gather information organically
3. Listen actively and probe deeper on interesting points
4. If they show high interest, try to book a meeting
5. Keep the conversation under ${winningCriteria.minDuration || 3} minutes unless highly engaged
6. Always be respectful and professional

IMPORTANT: Capture specific details when mentioned, especially numbers, dates, and names.`;
        const firstMessageOptions = [
            `Hi! This is {assistant_name} from ${campaignName}. I'm reaching out because ${winningCriteria.mainCriteria}. Do you have a quick moment?`,
            `Hello! I'm {assistant_name} calling from ${campaignName}. We help businesses like yours ${winningCriteria.mainCriteria}. Is this a good time to chat for a minute?`,
            `Hi there! {assistant_name} here from ${campaignName}. I'm calling because ${winningCriteria.mainCriteria}. Can I ask you a quick question?`
        ];
        const firstMessage = firstMessageOptions[Math.floor(Math.random() * firstMessageOptions.length)];
        return { systemPrompt, firstMessage };
    }
    async updateAssistantWithQualification(assistantId, campaignName, qualificationFields, winningCriteria) {
        try {
            const { systemPrompt, firstMessage } = await this.generateQualificationScript(campaignName, qualificationFields, winningCriteria);
            const updateData = {
                model: {
                    provider: 'openai',
                    model: 'gpt-4',
                    systemPrompt
                },
                firstMessage,
                recordingEnabled: true,
                endCallFunctionEnabled: true
            };
            const response = await this.client.patch(`/assistant/${assistantId}`, updateData);
            console.log('✅ Updated assistant with qualification script');
            return response.data;
        }
        catch (error) {
            console.error('Error updating assistant with qualification:', error);
            throw error;
        }
    }
    async analyzeScriptCoverage(assistantId, qualificationFields) {
        try {
            const response = await this.client.get(`/assistant/${assistantId}`);
            const assistant = response.data;
            const systemPrompt = assistant.model?.systemPrompt || '';
            const coveredFields = [];
            const missingFields = [];
            const recommendations = [];
            qualificationFields.forEach(field => {
                const hints = field.ai_detection_hints || [];
                const isCovered = hints.some(hint => systemPrompt.toLowerCase().includes(hint.toLowerCase()));
                if (isCovered) {
                    coveredFields.push(field.field_key);
                }
                else {
                    missingFields.push(field.field_key);
                    if (field.is_required) {
                        recommendations.push(`Add questions about ${field.field_name} - this is a required field`);
                    }
                    else if (field.scoring_weight >= 70) {
                        recommendations.push(`Consider adding ${field.field_name} questions - high scoring field (${field.scoring_weight}%)`);
                    }
                }
            });
            const coverageScore = (coveredFields.length / qualificationFields.length) * 100;
            return {
                coveredFields,
                missingFields,
                coverageScore: Math.round(coverageScore),
                recommendations
            };
        }
        catch (error) {
            console.error('Error analyzing script coverage:', error);
            throw error;
        }
    }
    async getAssistant(assistantId) {
        try {
            const response = await this.client.get(`/assistant/${assistantId}`);
            return response.data;
        }
        catch (error) {
            console.error('Error getting assistant:', error);
            throw error;
        }
    }
    async getVAPICredentials(organizationId) {
        try {
            console.log('🔍 Fetching VAPI credentials for organization:', organizationId);
            console.log('🔄 Checking organizations table for VAPI credentials...');
            const { data: organization, error: orgError } = await supabase_client_1.default
                .from('organizations')
                .select('settings, vapi_api_key, vapi_private_key, vapi_settings')
                .eq('id', organizationId)
                .single();
            if (organization && !orgError) {
                let vapiSettings = null;
                if (organization.settings?.vapi) {
                    vapiSettings = organization.settings.vapi;
                    console.log('✅ Found VAPI credentials in organizations.settings.vapi');
                }
                else if (organization.vapi_settings) {
                    try {
                        vapiSettings = JSON.parse(organization.vapi_settings);
                        console.log('✅ Found VAPI credentials in organizations.vapi_settings');
                    }
                    catch (parseError) {
                        console.log('⚠️ Could not parse vapi_settings column');
                    }
                }
                else if (organization.vapi_private_key || organization.vapi_api_key) {
                    vapiSettings = {
                        apiKey: organization.vapi_private_key || organization.vapi_api_key,
                        privateKey: organization.vapi_private_key || organization.vapi_api_key,
                        publicKey: organization.vapi_api_key,
                        webhookUrl: 'https://api.apexai.com/webhooks/vapi',
                        enabled: true
                    };
                    console.log('✅ Found VAPI credentials in organizations columns - using vapi_private_key for API');
                }
                if (vapiSettings && vapiSettings.apiKey) {
                    return {
                        apiKey: vapiSettings.apiKey,
                        privateKey: vapiSettings.privateKey || vapiSettings.apiKey,
                        webhookUrl: vapiSettings.webhookUrl || 'https://api.apexai.com/webhooks/vapi',
                        enabled: vapiSettings.enabled !== undefined ? vapiSettings.enabled : true
                    };
                }
            }
            console.log('🔄 Checking organization_settings for VAPI credentials...');
            const { data: settings, error: settingsError } = await supabase_client_1.default
                .from('organization_settings')
                .select('setting_value')
                .eq('organization_id', organizationId)
                .eq('setting_key', 'vapi_credentials')
                .single();
            if (settings && !settingsError) {
                try {
                    const credentials = JSON.parse(settings.setting_value);
                    console.log('✅ Found VAPI credentials in organization_settings');
                    return {
                        apiKey: credentials.apiKey,
                        privateKey: credentials.privateKey || credentials.apiKey,
                        webhookUrl: credentials.webhookUrl || 'https://api.apexai.com/webhooks/vapi',
                        enabled: credentials.enabled !== undefined ? credentials.enabled : true
                    };
                }
                catch (parseError) {
                    console.log('⚠️ Could not parse organization_settings VAPI credentials');
                }
            }
            console.log('⚠️ No VAPI credentials found for organization');
            return null;
        }
        catch (error) {
            console.error('❌ Error fetching VAPI credentials:', error);
            return null;
        }
    }
}
exports.VAPIIntegrationService = VAPIIntegrationService;
