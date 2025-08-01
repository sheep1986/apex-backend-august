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
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const compression_1 = __importDefault(require("compression"));
const dotenv_1 = require("dotenv");
const leads_1 = __importDefault(require("./api/leads"));
const calls_1 = __importDefault(require("./api/calls"));
const campaigns_1 = __importDefault(require("./api/campaigns"));
const phone_numbers_1 = __importDefault(require("./api/phone-numbers"));
const organizations_1 = __importDefault(require("./api/organizations"));
const team_management_1 = __importDefault(require("./api/team-management"));
const messaging_1 = __importDefault(require("./api/messaging"));
const notifications_1 = __importDefault(require("./api/notifications"));
const vapi_webhook_enhanced_1 = __importDefault(require("./api/vapi-webhook-enhanced"));
const stable_vapi_webhook_1 = __importDefault(require("./api/stable-vapi-webhook"));
const stable_vapi_data_1 = __importDefault(require("./api/stable-vapi-data"));
const vapi_outbound_1 = __importDefault(require("./api/vapi-outbound"));
const vapi_automation_webhook_1 = __importDefault(require("./api/vapi-automation-webhook"));
const campaign_automation_1 = __importDefault(require("./api/campaign-automation"));
const billing_1 = __importDefault(require("./api/billing"));
const stripe_webhook_1 = __importDefault(require("./api/stripe-webhook"));
const sync_vapi_call_1 = __importDefault(require("./api/sync-vapi-call"));
const organization_setup_fixed_1 = __importDefault(require("./api/organization-setup-fixed"));
const user_profile_1 = __importDefault(require("./api/user-profile"));
const platform_analytics_1 = __importDefault(require("./api/platform-analytics"));
const debug_vapi_1 = __importDefault(require("./api/debug-vapi"));
const invitations_1 = __importDefault(require("./api/invitations"));
const vapi_credentials_1 = __importDefault(require("./api/vapi-credentials"));
const test_vapi_1 = __importDefault(require("./api/test-vapi"));
const vapi_data_1 = __importDefault(require("./api/vapi-data"));
const debug_vapi_test_1 = __importDefault(require("./api/debug-vapi-test"));
const debug_frontend_1 = __importDefault(require("./api/debug-frontend"));
const debug_vapi_no_auth_1 = __importDefault(require("./api/debug-vapi-no-auth"));
const organization_settings_1 = __importDefault(require("./api/organization-settings"));
const appointments_1 = __importDefault(require("./api/appointments"));
const clerk_auth_1 = require("./middleware/clerk-auth");
const call_cleanup_service_1 = require("./services/call-cleanup-service");
const apiConfigurationsController = __importStar(require("./api/api-configurations"));
(0, dotenv_1.config)();
const app = (0, express_1.default)();
const PORT = process.env['PORT'] || 3001;
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        const allowedOrigins = [
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:5175',
            'http://localhost:5176',
            'http://localhost:5177',
            'http://localhost:5178',
            'http://localhost:5179',
            'http://localhost:5180',
            'http://localhost:5522',
            'http://localhost:3000',
            'http://localhost:8080',
            process.env['FRONTEND_URL']
        ].filter(Boolean);
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'development' ? 1000 : 100,
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);
app.use((0, compression_1.default)());
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});
app.post('/api/public/users', async (req, res) => {
    try {
        const { email, first_name, last_name, role, status, agency_name, phone_number, company, plan } = req.body;
        const userData = {
            email,
            first_name,
            last_name,
            role: role || 'agent',
            status: status || 'active',
            agency_name,
            phone_number,
            company,
            subscription_plan: plan || 'starter',
            subscription_status: 'active',
            monthly_cost: plan === 'starter' ? 299 : plan === 'professional' ? 599 : 1299,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        console.log('📝 Creating user (mock mode):', userData);
        res.status(201).json({
            id: 'mock-user-' + Date.now(),
            ...userData,
            message: 'User created successfully (mock mode - not saved to database)'
        });
    }
    catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});
app.use('/api/leads', clerk_auth_1.authenticateUser, leads_1.default);
app.use('/api/calls', clerk_auth_1.authenticateUser, calls_1.default);
app.use('/api/campaigns', clerk_auth_1.authenticateUser, campaigns_1.default);
app.use('/api/campaign-automation', clerk_auth_1.authenticateUser, campaign_automation_1.default);
app.use('/api/sync-vapi-call', clerk_auth_1.authenticateUser, sync_vapi_call_1.default);
app.use('/api/phone-numbers', clerk_auth_1.authenticateUser, phone_numbers_1.default);
app.use('/api/organizations', clerk_auth_1.authenticateUser, organizations_1.default);
app.use('/api/organization-settings', clerk_auth_1.authenticateUser, organization_settings_1.default);
app.use('/api/organization-setup', organization_setup_fixed_1.default);
app.use('/api/user-profile', clerk_auth_1.authenticateUser, user_profile_1.default);
app.use('/api/platform-analytics', clerk_auth_1.authenticateUser, platform_analytics_1.default);
app.use('/api/vapi-outbound', clerk_auth_1.authenticateUser, vapi_outbound_1.default);
app.use('/api/debug-vapi', clerk_auth_1.authenticateUser, debug_vapi_1.default);
app.use('/api/vapi-credentials', clerk_auth_1.authenticateUser, vapi_credentials_1.default);
app.use('/api/test-vapi', clerk_auth_1.authenticateUser, test_vapi_1.default);
app.use('/api/vapi-data', clerk_auth_1.authenticateUser, vapi_data_1.default);
app.use('/api/debug-vapi-test', debug_vapi_test_1.default);
app.use('/api/debug-frontend', debug_frontend_1.default);
app.use('/api/debug-vapi-no-auth', debug_vapi_no_auth_1.default);
app.use('/api', invitations_1.default);
app.use('/api/messages', clerk_auth_1.authenticateUser, messaging_1.default);
app.use('/api/team', clerk_auth_1.authenticateUser, team_management_1.default);
app.use('/api/notifications', clerk_auth_1.authenticateUser, notifications_1.default);
app.use('/api/appointments', clerk_auth_1.authenticateUser, appointments_1.default);
app.use('/api/billing', billing_1.default);
app.get('/api/api-configurations', clerk_auth_1.authenticateUser, apiConfigurationsController.getAllApiConfigurations);
app.get('/api/api-configurations/:serviceName', clerk_auth_1.authenticateUser, apiConfigurationsController.getApiConfiguration);
app.post('/api/api-configurations/:serviceName', clerk_auth_1.authenticateUser, apiConfigurationsController.saveApiConfiguration);
app.delete('/api/api-configurations/:serviceName', clerk_auth_1.authenticateUser, apiConfigurationsController.deleteApiConfiguration);
app.get('/api/api-configurations-audit', clerk_auth_1.authenticateUser, apiConfigurationsController.getConfigurationAuditLog);
app.use('/api/vapi', vapi_webhook_enhanced_1.default);
app.use('/api/vapi-automation-webhook', vapi_automation_webhook_1.default);
app.use('/api/stable-vapi', stable_vapi_webhook_1.default);
app.use('/api/stable-vapi-data', stable_vapi_data_1.default);
app.use('/api/stripe', express_1.default.raw({ type: 'application/json' }), stripe_webhook_1.default);
app.get('/debug/org/:id/settings', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('🔍 DEBUG: Fetching organization settings for:', id);
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const { data: organization, error: orgError } = await supabase
            .from('organizations')
            .select('id, name, settings, vapi_api_key, vapi_settings')
            .eq('id', id)
            .single();
        if (orgError || !organization) {
            console.error('❌ DEBUG: Organization not found:', orgError);
            return res.status(404).json({ error: 'Organization not found', debug: true });
        }
        console.log('✅ DEBUG: Organization found:', organization);
        let vapiConfig = {
            apiKey: '',
            privateKey: '',
            webhookUrl: 'https://api.apexai.com/webhooks/vapi',
            enabled: false
        };
        let vapiSettings = null;
        if (organization.settings?.vapi) {
            vapiSettings = organization.settings.vapi;
            console.log('✅ DEBUG: Found VAPI settings in settings.vapi');
        }
        else if (organization.vapi_settings) {
            try {
                vapiSettings = JSON.parse(organization.vapi_settings);
                console.log('✅ DEBUG: Found VAPI settings in vapi_settings column');
            }
            catch (parseError) {
                console.log('⚠️ DEBUG: Could not parse vapi_settings column');
            }
        }
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
            organizationId: id,
            organizationName: organization.name,
            settings: {
                vapi: vapiConfig
            },
            raw: organization
        });
    }
    catch (error) {
        console.error('❌ DEBUG: Error fetching organization settings:', error);
        res.status(500).json({ error: 'Internal server error', debug: true });
    }
});
app.use((err, req, res, next) => {
    console.error('Error:', err);
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large' });
    }
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});
app.listen(PORT, () => {
    console.log(`🚀 Apex AI Calling Platform API Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    console.log('🎯 Starting campaign automation system...');
    console.log('🧹 Starting call cleanup service...');
    call_cleanup_service_1.callCleanupService.start();
});
exports.default = app;
