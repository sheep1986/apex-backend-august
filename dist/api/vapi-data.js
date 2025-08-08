"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const clerk_auth_1 = require("../middleware/clerk-auth");
const vapi_integration_service_1 = require("../services/vapi-integration-service");
const router = (0, express_1.Router)();
router.use(clerk_auth_1.authenticateUser);
router.get('/assistants', async (req, res) => {
    try {
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(400).json({
                error: 'User not associated with an organization',
                assistants: []
            });
        }
        console.log('🔍 Fetching VAPI assistants for organization:', organizationId);
        const vapiService = await vapi_integration_service_1.VAPIIntegrationService.forOrganization(organizationId);
        if (!vapiService) {
            console.log('⚠️ No VAPI service available for organization');
            return res.json({
                assistants: [],
                message: 'VAPI integration not configured. Please add your VAPI API key in Organization Settings.',
                requiresConfiguration: true
            });
        }
        const assistants = await vapiService.listAssistants();
        console.log(`✅ Retrieved ${assistants.length} assistants from VAPI`);
        res.json({
            assistants,
            count: assistants.length
        });
    }
    catch (error) {
        console.error('❌ Error fetching VAPI assistants:', error);
        res.status(500).json({
            error: 'Failed to fetch assistants',
            assistants: []
        });
    }
});
router.get('/phone-numbers', async (req, res) => {
    try {
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(400).json({
                error: 'User not associated with an organization',
                phoneNumbers: []
            });
        }
        console.log('📱 Fetching VAPI phone numbers for organization:', organizationId);
        const vapiService = await vapi_integration_service_1.VAPIIntegrationService.forOrganization(organizationId);
        if (!vapiService) {
            console.log('⚠️ No VAPI service available for organization');
            return res.json({
                phoneNumbers: [],
                message: 'VAPI integration not configured. Please add your VAPI API key in Organization Settings.',
                requiresConfiguration: true
            });
        }
        const phoneNumbers = await vapiService.getPhoneNumbers();
        console.log(`✅ Retrieved ${phoneNumbers.length} phone numbers from VAPI`);
        res.json({
            phoneNumbers,
            count: phoneNumbers.length
        });
    }
    catch (error) {
        console.error('❌ Error fetching VAPI phone numbers:', error);
        res.status(500).json({
            error: 'Failed to fetch phone numbers',
            phoneNumbers: []
        });
    }
});
router.get('/all', async (req, res) => {
    try {
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(400).json({
                error: 'User not associated with an organization',
                assistants: [],
                phoneNumbers: []
            });
        }
        console.log('🔄 Fetching all VAPI data for organization:', organizationId);
        const vapiService = await vapi_integration_service_1.VAPIIntegrationService.forOrganization(organizationId);
        if (!vapiService) {
            console.log('⚠️ No VAPI service available for organization');
            return res.json({
                assistants: [],
                phoneNumbers: [],
                message: 'VAPI integration not configured'
            });
        }
        const [assistants, phoneNumbers] = await Promise.all([
            vapiService.listAssistants().catch(() => []),
            vapiService.getPhoneNumbers().catch(() => [])
        ]);
        console.log(`✅ Retrieved ${assistants.length} assistants and ${phoneNumbers.length} phone numbers from VAPI`);
        res.json({
            assistants,
            phoneNumbers,
            assistantCount: assistants.length,
            phoneNumberCount: phoneNumbers.length
        });
    }
    catch (error) {
        console.error('❌ Error fetching VAPI data:', error);
        res.status(500).json({
            error: 'Failed to fetch VAPI data',
            assistants: [],
            phoneNumbers: []
        });
    }
});
exports.default = router;
