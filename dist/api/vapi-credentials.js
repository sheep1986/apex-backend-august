"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const clerk_auth_1 = require("../middleware/clerk-auth");
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const router = (0, express_1.Router)();
router.use(clerk_auth_1.authenticateUser);
router.get('/', async (req, res) => {
    try {
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(400).json({
                error: 'User not associated with an organization',
                hasApiKey: false
            });
        }
        console.log('🔑 Fetching VAPI credentials for organization:', organizationId);
        const { data: organization, error } = await supabase_client_1.default
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
        const hasApiKey = !!(organization.vapi_api_key || organization.settings?.vapi?.apiKey);
        const hasPrivateKey = !!(organization.vapi_private_key || organization.settings?.vapi?.privateKey);
        const response = {
            hasApiKey,
            hasPrivateKey,
            hasCredentials: hasApiKey && hasPrivateKey,
            organizationId: organization.id,
            organizationName: organization.name
        };
        if (req.user?.role === 'platform_owner' || req.user?.role === 'client_admin') {
            response['credentials'] = {
                vapi_api_key: organization.vapi_api_key || organization.settings?.vapi?.apiKey,
                vapi_private_key: organization.vapi_private_key || organization.settings?.vapi?.privateKey,
                vapi_webhook_url: organization.vapi_webhook_url || `${process.env.BACKEND_URL}/api/vapi-webhook`
            };
        }
        console.log('✅ VAPI credentials check:', { hasApiKey, hasPrivateKey });
        res.json(response);
    }
    catch (error) {
        console.error('❌ Error in VAPI credentials endpoint:', error);
        res.status(500).json({
            error: 'Internal server error',
            hasApiKey: false
        });
    }
});
router.put('/', async (req, res) => {
    try {
        const organizationId = req.user?.organizationId;
        const userRole = req.user?.role;
        if (userRole !== 'platform_owner' && userRole !== 'client_admin') {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        if (!organizationId) {
            return res.status(400).json({ error: 'User not associated with an organization' });
        }
        const { vapi_api_key, vapi_private_key, vapi_webhook_url } = req.body;
        const updateData = {
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
        updateData.settings = {
            vapi: {
                apiKey: vapi_api_key,
                privateKey: vapi_private_key,
                webhookUrl: vapi_webhook_url,
                updated_at: new Date().toISOString()
            }
        };
        const { data: organization, error } = await supabase_client_1.default
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
    }
    catch (error) {
        console.error('❌ Error updating VAPI credentials:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
