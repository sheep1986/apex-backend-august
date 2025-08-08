"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const axios_1 = __importDefault(require("axios"));
const router = (0, express_1.Router)();
router.get('/:id', async (req, res) => {
    try {
        const { id: campaignId } = req.params;
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { data: campaign, error } = await supabase_client_1.default
            .from('campaigns')
            .select('*')
            .eq('id', campaignId)
            .eq('organization_id', organizationId)
            .single();
        if (error || !campaign) {
            return res.status(404).json({ error: 'Campaign not found' });
        }
        const { data: org } = await supabase_client_1.default
            .from('organizations')
            .select('vapi_private_key, settings')
            .eq('id', organizationId)
            .single();
        const vapiApiKey = org?.vapi_private_key || org?.settings?.vapi?.privateKey;
        let phoneNumbers = [];
        if (vapiApiKey && campaign.phone_number_id) {
            try {
                const response = await axios_1.default.get('https://api.vapi.ai/phone-number', {
                    headers: {
                        'Authorization': `Bearer ${vapiApiKey}`,
                        'Content-Type': 'application/json'
                    }
                });
                const allNumbers = response.data;
                const campaignNumber = allNumbers.find((n) => n.id === campaign.phone_number_id);
                if (campaignNumber) {
                    phoneNumbers = [{
                            id: campaignNumber.id,
                            number: campaignNumber.number,
                            name: campaignNumber.name || 'Primary',
                            provider: campaignNumber.provider
                        }];
                }
            }
            catch (error) {
                console.error('Error fetching VAPI phone numbers:', error);
            }
        }
        let assistant = null;
        if (vapiApiKey && campaign.assistant_id) {
            try {
                const response = await axios_1.default.get('https://api.vapi.ai/assistant', {
                    headers: {
                        'Authorization': `Bearer ${vapiApiKey}`,
                        'Content-Type': 'application/json'
                    }
                });
                const allAssistants = response.data;
                assistant = allAssistants.find((a) => a.id === campaign.assistant_id);
            }
            catch (error) {
                console.error('Error fetching VAPI assistants:', error);
            }
        }
        const enhancedCampaign = {
            ...campaign,
            phoneNumbers: phoneNumbers.map(n => n.number),
            phoneNumberDetails: phoneNumbers,
            assistantName: assistant?.name || 'AI Assistant',
            assistantDetails: assistant
        };
        res.json({ campaign: enhancedCampaign });
    }
    catch (error) {
        console.error('Error fetching campaign with phone:', error);
        res.status(500).json({ error: 'Failed to fetch campaign details' });
    }
});
exports.default = router;
