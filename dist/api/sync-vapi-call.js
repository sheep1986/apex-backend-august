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
const express_1 = require("express");
const axios_1 = __importDefault(require("axios"));
const supabase_js_1 = require("@supabase/supabase-js");
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const router = (0, express_1.Router)();
router.post('/:callId', async (req, res) => {
    try {
        const { callId } = req.params;
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(401).json({ error: 'No organization found' });
        }
        console.log(`🔄 Syncing VAPI call ${callId} for org ${organizationId}`);
        const { data: organization, error: orgError } = await supabase
            .from('organizations')
            .select('settings, vapi_api_key, vapi_private_key')
            .eq('id', organizationId)
            .single();
        if (orgError || !organization) {
            return res.status(404).json({ error: 'Organization not found' });
        }
        const vapiApiKey = organization.vapi_private_key ||
            organization.vapi_api_key ||
            organization.settings?.vapi?.privateKey ||
            organization.settings?.vapi?.apiKey;
        if (!vapiApiKey) {
            return res.status(400).json({ error: 'VAPI API key not configured' });
        }
        console.log(`📞 Fetching call from VAPI API...`);
        const vapiResponse = await axios_1.default.get(`https://api.vapi.ai/call/${callId}`, {
            headers: {
                'Authorization': `Bearer ${vapiApiKey}`,
                'Content-Type': 'application/json'
            }
        });
        const vapiCall = vapiResponse.data;
        console.log(`✅ Retrieved call from VAPI:`, {
            id: vapiCall.id,
            status: vapiCall.status,
            duration: vapiCall.duration,
            hasTranscript: !!vapiCall.transcript
        });
        const updateData = {
            status: vapiCall.status === 'ended' ? 'completed' : vapiCall.status,
            duration: vapiCall.duration || 0,
            cost: vapiCall.cost || 0,
            recording_url: vapiCall.recordingUrl || vapiCall.stereoRecordingUrl,
            transcript: vapiCall.transcript,
            summary: vapiCall.summary,
            ended_at: vapiCall.endedAt,
            ended_reason: vapiCall.endedReason,
            metadata: {
                ...vapiCall,
                manually_synced: true,
                synced_at: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
        };
        const { data: updatedCall, error: updateError } = await supabase
            .from('calls')
            .update(updateData)
            .eq('vapi_call_id', callId)
            .eq('organization_id', organizationId)
            .select()
            .single();
        if (updateError) {
            console.error('❌ Error updating call:', updateError);
            return res.status(500).json({ error: 'Failed to update call' });
        }
        console.log('✅ Call updated successfully');
        if (vapiCall.status === 'ended' && vapiCall.transcript) {
            console.log('🤖 Triggering AI processing...');
            try {
                const { processCallWithAI } = await Promise.resolve().then(() => __importStar(require('../services/ai-call-processor')));
                await processCallWithAI(updatedCall.id, vapiCall);
                console.log('✅ AI processing triggered');
            }
            catch (aiError) {
                console.error('❌ AI processing failed:', aiError);
            }
        }
        res.json({
            success: true,
            call: updatedCall,
            synced: true,
            aiProcessing: vapiCall.status === 'ended' && vapiCall.transcript
        });
    }
    catch (error) {
        console.error('❌ Error syncing VAPI call:', error);
        if (error.response?.status === 404) {
            return res.status(404).json({ error: 'Call not found in VAPI' });
        }
        res.status(500).json({
            error: 'Failed to sync call',
            details: error.response?.data || error.message
        });
    }
});
router.get('/:callId/status', async (req, res) => {
    try {
        const { callId } = req.params;
        const organizationId = req.user?.organizationId;
        const { data: call, error } = await supabase
            .from('calls')
            .select('status, duration, transcript, updated_at')
            .eq('vapi_call_id', callId)
            .eq('organization_id', organizationId)
            .single();
        if (error || !call) {
            return res.status(404).json({ error: 'Call not found' });
        }
        const needsSync = call.status === 'in_progress' ||
            call.status === 'ringing' ||
            (!call.transcript && call.duration > 0);
        res.json({
            status: call.status,
            duration: call.duration,
            hasTranscript: !!call.transcript,
            lastUpdated: call.updated_at,
            needsSync
        });
    }
    catch (error) {
        console.error('❌ Error checking call status:', error);
        res.status(500).json({ error: 'Failed to check call status' });
    }
});
exports.default = router;
