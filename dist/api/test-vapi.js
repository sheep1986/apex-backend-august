"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const clerk_auth_1 = require("../middleware/clerk-auth");
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const axios_1 = __importDefault(require("axios"));
const router = (0, express_1.Router)();
router.use(clerk_auth_1.authenticateUser);
router.get('/', async (req, res) => {
    try {
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(400).json({ error: 'No organization ID' });
        }
        console.log('🧪 Testing VAPI for organization:', organizationId);
        const { data: org, error } = await supabase_client_1.default
            .from('organizations')
            .select('vapi_api_key, vapi_private_key, name')
            .eq('id', organizationId)
            .single();
        if (error || !org) {
            return res.status(404).json({ error: 'Organization not found' });
        }
        console.log('🏢 Organization:', org.name);
        console.log('🔑 Has vapi_api_key:', !!org.vapi_api_key);
        console.log('🔐 Has vapi_private_key:', !!org.vapi_private_key);
        const apiKey = org.vapi_private_key || org.vapi_api_key;
        if (!apiKey) {
            return res.json({
                organization: org.name,
                hasVapiApiKey: false,
                hasVapiPrivateKey: false,
                error: 'No VAPI credentials found'
            });
        }
        const results = {
            organization: org.name,
            hasVapiApiKey: !!org.vapi_api_key,
            hasVapiPrivateKey: !!org.vapi_private_key,
            usingKey: org.vapi_private_key ? 'private_key' : 'api_key',
            keyPreview: apiKey.substring(0, 10) + '...',
            assistants: null,
            phoneNumbers: null,
            errors: []
        };
        try {
            console.log('📞 Testing VAPI assistants endpoint...');
            const assistantsResponse = await axios_1.default.get('https://api.vapi.ai/assistant', {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log('✅ Assistants response:', {
                status: assistantsResponse.status,
                dataType: typeof assistantsResponse.data,
                isArray: Array.isArray(assistantsResponse.data),
                dataKeys: assistantsResponse.data ? Object.keys(assistantsResponse.data) : []
            });
            results.assistants = {
                success: true,
                count: Array.isArray(assistantsResponse.data) ? assistantsResponse.data.length : 'not an array',
                data: assistantsResponse.data
            };
        }
        catch (error) {
            console.error('❌ Assistants error:', error.response?.data || error.message);
            results.assistants = {
                success: false,
                error: error.response?.data || error.message,
                status: error.response?.status
            };
            results.errors.push(`Assistants: ${error.message}`);
        }
        try {
            console.log('📱 Testing VAPI phone numbers endpoint...');
            const phoneResponse = await axios_1.default.get('https://api.vapi.ai/phone-number', {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            console.log('✅ Phone numbers response:', {
                status: phoneResponse.status,
                dataType: typeof phoneResponse.data,
                isArray: Array.isArray(phoneResponse.data),
                dataKeys: phoneResponse.data ? Object.keys(phoneResponse.data) : []
            });
            results.phoneNumbers = {
                success: true,
                count: Array.isArray(phoneResponse.data) ? phoneResponse.data.length : 'not an array',
                data: phoneResponse.data
            };
        }
        catch (error) {
            console.error('❌ Phone numbers error:', error.response?.data || error.message);
            results.phoneNumbers = {
                success: false,
                error: error.response?.data || error.message,
                status: error.response?.status
            };
            results.errors.push(`Phone Numbers: ${error.message}`);
        }
        res.json(results);
    }
    catch (error) {
        console.error('❌ Test error:', error);
        res.status(500).json({ error: 'Test failed', details: error });
    }
});
exports.default = router;
