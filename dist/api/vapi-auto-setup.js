"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoConfigureVAPI = autoConfigureVAPI;
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const supabase = supabase_client_1.default.getClient();
async function autoConfigureVAPI(req, res) {
    const { organizationId, vapiApiKey } = req.body;
    try {
        console.log('🚀 Starting VAPI auto-configuration for org:', organizationId);
        const assistantsResponse = await fetch('https://api.vapi.ai/assistant', {
            headers: { 'Authorization': `Bearer ${vapiApiKey}` }
        });
        if (!assistantsResponse.ok) {
            return res.status(400).json({ error: 'Invalid VAPI API key' });
        }
        const assistants = await assistantsResponse.json();
        console.log(`Found ${assistants.length} assistants to configure`);
        const webhookUrl = 'https://apex-backend-august-production.up.railway.app/api/vapi-automation-webhook';
        let successCount = 0;
        for (const assistant of assistants) {
            try {
                const updateResponse = await fetch(`https://api.vapi.ai/assistant/${assistant.id}`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${vapiApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        server: {
                            url: webhookUrl,
                            timeoutSeconds: 20
                        }
                    })
                });
                if (updateResponse.ok) {
                    successCount++;
                    console.log(`✅ Updated assistant: ${assistant.name || assistant.id}`);
                }
            }
            catch (error) {
                console.error(`Failed to update assistant ${assistant.id}:`, error);
            }
        }
        const phoneResponse = await fetch('https://api.vapi.ai/phone-number', {
            headers: { 'Authorization': `Bearer ${vapiApiKey}` }
        });
        const phoneNumbers = await phoneResponse.json();
        console.log(`Found ${phoneNumbers.length} phone numbers`);
        await supabase
            .from('organizations')
            .update({
            vapi_private_key: vapiApiKey,
            vapi_webhook_configured: true,
            vapi_webhook_url: webhookUrl,
            vapi_assistants_count: assistants.length,
            vapi_setup_date: new Date().toISOString()
        })
            .eq('id', organizationId);
        for (const phone of phoneNumbers) {
            await supabase
                .from('phone_numbers')
                .upsert({
                organization_id: organizationId,
                vapi_phone_id: phone.id,
                number: phone.number,
                assistant_id: phone.assistantId,
                provider: phone.provider,
                name: phone.name
            }, {
                onConflict: 'vapi_phone_id'
            });
        }
        res.json({
            success: true,
            message: 'VAPI account configured successfully!',
            stats: {
                assistantsConfigured: successCount,
                totalAssistants: assistants.length,
                phoneNumbersImported: phoneNumbers.length,
                webhookUrl: webhookUrl
            }
        });
    }
    catch (error) {
        console.error('VAPI auto-configuration error:', error);
        res.status(500).json({ error: 'Failed to configure VAPI account' });
    }
}
