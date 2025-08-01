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
const vapi_outbound_service_1 = require("../services/vapi-outbound-service");
const ai_service_1 = require("../services/ai-service");
const mock_webhook_service_1 = require("../services/mock-webhook-service");
const multer_1 = __importDefault(require("multer"));
const supabase_js_1 = require("@supabase/supabase-js");
const supabaseService = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
const aiService = new ai_service_1.AIConversationService({
    openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        model: 'gpt-4',
        maxTokens: 1000
    },
    elevenlabs: {
        apiKey: process.env.ELEVENLABS_API_KEY || '',
        voiceId: 'default'
    },
    whisper: {
        model: 'whisper-1'
    }
});
router.get('/campaigns', async (req, res) => {
    try {
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        console.log('📋 Fetching VAPI campaigns for organization:', organizationId);
        const { data: campaigns, error } = await supabaseService
            .from('campaigns')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('type', 'outbound')
            .order('created_at', { ascending: false });
        if (error) {
            console.error('❌ Error fetching campaigns:', error);
            return res.status(500).json({ error: 'Failed to fetch campaigns' });
        }
        const campaignsWithMetrics = await Promise.all((campaigns || []).map(async (campaign) => {
            try {
                const outboundService = await vapi_outbound_service_1.VAPIOutboundService.forOrganization(organizationId);
                const metrics = outboundService ?
                    await outboundService.getCampaignMetrics(campaign.id) :
                    {
                        totalLeads: 0,
                        callsAttempted: 0,
                        callsConnected: 0,
                        callsCompleted: 0,
                        connectionRate: 0,
                        activeCalls: 0,
                        leadsRemaining: 0,
                        totalCost: 0
                    };
                const { data: leads, error: leadsError } = await supabaseService
                    .from('leads')
                    .select('id', { count: 'exact' })
                    .eq('campaign_id', campaign.id);
                const leadCount = leads?.length || 0;
                return {
                    id: campaign.id,
                    apexId: campaign.apex_id || `apex${campaign.id.substring(0, 5)}`,
                    name: campaign.name,
                    description: campaign.description,
                    status: campaign.status,
                    assistantId: campaign.assistant_id,
                    assistantName: 'AI Assistant',
                    phoneNumberId: campaign.phone_number_id,
                    createdAt: campaign.created_at,
                    updatedAt: campaign.updated_at,
                    totalLeads: metrics.totalLeads || leadCount || 0,
                    callsCompleted: metrics.callsCompleted || 0,
                    totalCost: metrics.totalCost || 0,
                    successRate: metrics.callsCompleted > 0 ?
                        ((metrics.positiveOutcomes || 0) / metrics.callsCompleted * 100) : 0,
                    totalCalls: metrics.callsAttempted || campaign.total_calls || 0,
                    successfulCalls: metrics.positiveOutcomes || campaign.successful_calls || 0,
                    callsInProgress: metrics.activeCalls || 0,
                    metrics
                };
            }
            catch (error) {
                console.warn('⚠️ Error getting metrics for campaign:', campaign.id, error);
                const { data: leads } = await supabaseService
                    .from('leads')
                    .select('id', { count: 'exact' })
                    .eq('campaign_id', campaign.id);
                const leadCount = leads?.length || 0;
                return {
                    id: campaign.id,
                    apexId: campaign.apex_id || `apex${campaign.id.substring(0, 5)}`,
                    name: campaign.name,
                    description: campaign.description,
                    status: campaign.status,
                    assistantId: campaign.assistant_id,
                    assistantName: 'AI Assistant',
                    phoneNumberId: campaign.phone_number_id,
                    createdAt: campaign.created_at,
                    updatedAt: campaign.updated_at,
                    totalLeads: leadCount || 0,
                    callsCompleted: 0,
                    totalCost: 0,
                    successRate: 0,
                    totalCalls: campaign.total_calls || 0,
                    successfulCalls: campaign.successful_calls || 0,
                    callsInProgress: 0,
                    metrics: {
                        totalLeads: leadCount || 0,
                        callsAttempted: 0,
                        callsConnected: 0,
                        callsCompleted: 0,
                        connectionRate: 0,
                        activeCalls: 0,
                        leadsRemaining: leadCount || 0,
                        totalCost: 0
                    }
                };
            }
        }));
        res.json({ campaigns: campaignsWithMetrics });
    }
    catch (error) {
        console.error('❌ Error in VAPI campaigns GET:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/campaigns', async (req, res) => {
    try {
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { name, description, assistantId, phoneNumberId, phoneNumber, schedule, csvData, assignedTeam, sendTiming, scheduleDate, scheduleTime } = req.body;
        if (!name) {
            return res.status(400).json({
                error: 'Campaign name is required'
            });
        }
        console.log('🚀 Creating VAPI outbound campaign:', name);
        let outboundService = await vapi_outbound_service_1.VAPIOutboundService.forOrganization(organizationId);
        if (!outboundService) {
            console.log('📝 No VAPI credentials found, creating development campaign');
            outboundService = new vapi_outbound_service_1.VAPIOutboundService(organizationId, null);
        }
        const campaign = await outboundService.createCampaign({
            name,
            description,
            assistantId,
            phoneNumberId,
            phoneNumber,
            schedule,
            csvData,
            assignedTeam,
            sendTiming,
            scheduleDate,
            scheduleTime,
            status: 'draft',
            createdBy: req.user?.id
        });
        let leads = [];
        let metrics = null;
        if (campaign.id) {
            try {
                const campaignDashboard = await outboundService.getCampaignDashboard(campaign.id);
                leads = campaignDashboard.leads || [];
                metrics = campaignDashboard.metrics;
            }
            catch (error) {
                console.log('⚠️ Could not fetch campaign dashboard, but campaign created successfully');
            }
        }
        res.status(201).json({
            campaign,
            leads,
            metrics,
            message: 'Campaign created successfully'
        });
    }
    catch (error) {
        console.error('❌ Error creating VAPI campaign:', error);
        res.status(500).json({
            error: 'Failed to create campaign',
            message: error.message
        });
    }
});
router.get('/campaigns/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        console.log('📊 Fetching campaign dashboard:', id);
        const outboundService = await vapi_outbound_service_1.VAPIOutboundService.forOrganization(organizationId);
        if (!outboundService) {
            return res.status(400).json({
                error: 'VAPI credentials not configured for this organization'
            });
        }
        const campaign = await outboundService.getCampaignDashboard(id);
        res.json({ campaign });
    }
    catch (error) {
        console.error('❌ Error fetching campaign dashboard:', error);
        res.status(500).json({
            error: 'Failed to fetch campaign dashboard',
            message: error.message
        });
    }
});
router.post('/campaigns/:id/upload-leads', upload.single('csvFile'), async (req, res) => {
    try {
        const { id: campaignId } = req.params;
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'CSV file is required' });
        }
        console.log('📤 Uploading leads to campaign:', campaignId);
        const outboundService = await vapi_outbound_service_1.VAPIOutboundService.forOrganization(organizationId);
        if (!outboundService) {
            return res.status(400).json({
                error: 'VAPI credentials not configured for this organization'
            });
        }
        const csvData = req.file.buffer.toString('utf-8');
        const result = await outboundService.uploadLeadsFromCSV(campaignId, csvData);
        res.json({
            message: 'Leads uploaded successfully',
            ...result
        });
    }
    catch (error) {
        console.error('❌ Error uploading leads:', error);
        res.status(500).json({
            error: 'Failed to upload leads',
            message: error.message
        });
    }
});
router.post('/campaigns/:id/start', async (req, res) => {
    try {
        const { id: campaignId } = req.params;
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        console.log('▶️ Starting campaign:', campaignId);
        const outboundService = await vapi_outbound_service_1.VAPIOutboundService.forOrganization(organizationId);
        if (!outboundService) {
            return res.status(400).json({
                error: 'VAPI credentials not configured for this organization'
            });
        }
        await outboundService.startCampaign(campaignId);
        res.json({ message: 'Campaign started successfully' });
    }
    catch (error) {
        console.error('❌ Error starting campaign:', error);
        res.status(500).json({
            error: 'Failed to start campaign',
            message: error.message
        });
    }
});
router.post('/campaigns/:id/pause', async (req, res) => {
    try {
        const { id: campaignId } = req.params;
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        console.log('⏸️ Pausing campaign:', campaignId);
        const outboundService = await vapi_outbound_service_1.VAPIOutboundService.forOrganization(organizationId);
        if (!outboundService) {
            return res.status(400).json({
                error: 'VAPI credentials not configured for this organization'
            });
        }
        await outboundService.pauseCampaign(campaignId);
        res.json({ message: 'Campaign paused successfully' });
    }
    catch (error) {
        console.error('❌ Error pausing campaign:', error);
        res.status(500).json({
            error: 'Failed to pause campaign',
            message: error.message
        });
    }
});
router.post('/campaigns/:id/resume', async (req, res) => {
    try {
        const { id: campaignId } = req.params;
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        console.log('▶️ Resuming campaign:', campaignId);
        const outboundService = await vapi_outbound_service_1.VAPIOutboundService.forOrganization(organizationId);
        if (!outboundService) {
            return res.status(400).json({
                error: 'VAPI credentials not configured for this organization'
            });
        }
        await outboundService.resumeCampaign(campaignId);
        res.json({ message: 'Campaign resumed successfully' });
    }
    catch (error) {
        console.error('❌ Error resuming campaign:', error);
        res.status(500).json({
            error: 'Failed to resume campaign',
            message: error.message
        });
    }
});
router.get('/campaigns/:id/live', async (req, res) => {
    try {
        const { id: campaignId } = req.params;
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const outboundService = await vapi_outbound_service_1.VAPIOutboundService.forOrganization(organizationId);
        if (!outboundService) {
            return res.status(400).json({
                error: 'VAPI credentials not configured for this organization'
            });
        }
        const liveData = await outboundService.getLiveCampaignData(campaignId);
        res.json(liveData);
    }
    catch (error) {
        console.error('❌ Error fetching live campaign data:', error);
        res.status(500).json({
            error: 'Failed to fetch live campaign data',
            message: error.message
        });
    }
});
router.get('/campaigns/:id/calls', async (req, res) => {
    try {
        const { id: campaignId } = req.params;
        const organizationId = req.user?.organizationId;
        const { page = '1', limit = '50', status, sortBy = 'started_at', sortOrder = 'desc' } = req.query;
        if (!organizationId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        console.log(`📞 Fetching calls for campaign: ${campaignId}`);
        const { data: campaign, error: campaignError } = await supabaseService
            .from('campaigns')
            .select('id, name')
            .eq('id', campaignId)
            .eq('organization_id', organizationId)
            .single();
        if (campaignError || !campaign) {
            return res.status(404).json({ error: 'Campaign not found' });
        }
        let query = supabaseService
            .from('calls')
            .select(`
        id,
        vapi_call_id,
        lead_id,
        to_number,
        phone_number,
        direction,
        status,
        started_at,
        ended_at,
        duration,
        cost,
        transcript,
        summary,
        recording_url,
        sentiment,
        ai_confidence_score,
        customer_name,
        leads(first_name, last_name, email, company)
      `)
            .eq('campaign_id', campaignId)
            .eq('organization_id', organizationId);
        if (status) {
            query = query.eq('status', status);
        }
        const validSortFields = ['started_at', 'ended_at', 'duration', 'cost'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'started_at';
        const order = sortOrder === 'asc' ? 'asc' : 'desc';
        query = query.order(sortField, { ascending: order === 'asc' });
        const offset = (Number(page) - 1) * Number(limit);
        query = query.range(offset, offset + Number(limit) - 1);
        const { data: calls, error: callsError } = await query;
        if (callsError) {
            throw callsError;
        }
        console.log('📞 Raw calls from DB:', calls?.map(c => ({
            id: c.id.substring(0, 8),
            recording_url: c.recording_url ? 'present' : 'null',
            status: c.status
        })));
        const transformedCalls = calls?.map((call) => {
            let customerName = call.customer_name ||
                (call.leads ? `${call.leads.first_name} ${call.leads.last_name}`.trim() : null) ||
                'Unknown';
            if (customerName.trim() === '') {
                customerName = 'Unknown';
            }
            return {
                id: call.id,
                vapiCallId: call.vapi_call_id,
                customerName,
                customerPhone: call.to_number || call.phone_number,
                customerEmail: call.leads?.email || null,
                customerCompany: call.leads?.company || null,
                status: call.status,
                startedAt: call.started_at,
                endedAt: call.ended_at,
                duration: call.duration || 0,
                cost: call.cost || 0,
                hasTranscript: !!(call.transcript),
                hasRecording: !!(call.recording_url),
                sentiment: call.sentiment ||
                    (call.ai_confidence_score > 0.6 ? 'positive' :
                        call.ai_confidence_score < 0.4 ? 'negative' : 'neutral'),
                transcript: call.transcript,
                summary: call.summary,
                recording: call.recording_url
            };
        }) || [];
        const { count: totalCount } = await supabaseService
            .from('calls')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaignId)
            .eq('organization_id', organizationId);
        res.json({
            calls: transformedCalls,
            campaign: {
                id: campaign.id,
                name: campaign.name
            },
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: totalCount || 0,
                totalPages: Math.ceil((totalCount || 0) / Number(limit))
            }
        });
    }
    catch (error) {
        console.error('❌ Error fetching campaign calls:', error);
        res.status(500).json({
            error: 'Failed to fetch campaign calls',
            message: error.message
        });
    }
});
router.get('/assistants', async (req, res) => {
    try {
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        console.log('🤖 Fetching VAPI assistants for organization');
        const { VAPIIntegrationService } = await Promise.resolve().then(() => __importStar(require('../services/vapi-integration-service')));
        const vapiService = await VAPIIntegrationService.forOrganization(organizationId);
        if (!vapiService) {
            return res.status(400).json({
                error: 'VAPI credentials not configured for this organization'
            });
        }
        let assistants = [];
        let apiError = null;
        try {
            assistants = await vapiService.listAssistants();
            console.log('✅ Successfully fetched assistants from VAPI:', assistants.length);
        }
        catch (error) {
            console.error('❌ Failed to fetch assistants from VAPI:', error);
            apiError = error.response?.data?.message || error.message || 'Failed to fetch from VAPI';
            if (error.response?.status === 401) {
                return res.status(400).json({
                    error: 'VAPI API key is invalid or expired',
                    message: 'Please check your VAPI API key configuration',
                    details: apiError,
                    assistants: []
                });
            }
            assistants = [];
        }
        const { data: localAssistants } = await supabaseService
            .from('vapi_assistants')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('is_active', true);
        const formattedAssistants = assistants.map(assistant => ({
            id: assistant.id,
            name: assistant.name || 'Unnamed Assistant',
            type: assistant.type || 'outbound',
            voice: assistant.voice?.provider || 'elevenlabs',
            model: assistant.model?.provider || 'openai',
            firstMessage: assistant.firstMessage || '',
            createdAt: assistant.createdAt,
            isActive: true
        }));
        if (localAssistants && localAssistants.length > 0) {
            const localFormatted = localAssistants.map(assistant => ({
                id: assistant.vapi_assistant_id,
                name: assistant.name || 'Unnamed Assistant',
                type: assistant.type || 'outbound',
                voice: assistant.voice_id || 'elevenlabs',
                model: 'openai',
                firstMessage: assistant.first_message || '',
                createdAt: assistant.created_at,
                isActive: assistant.is_active
            }));
            formattedAssistants.push(...localFormatted);
        }
        res.json({
            assistants: formattedAssistants,
            ...(apiError && { warning: `VAPI API Error: ${apiError}` })
        });
    }
    catch (error) {
        console.error('❌ Error fetching assistants:', error);
        res.status(500).json({
            error: 'Failed to fetch assistants',
            message: error.message
        });
    }
});
router.get('/phone-numbers', async (req, res) => {
    try {
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        console.log('📞 Fetching VAPI phone numbers for organization');
        const { VAPIIntegrationService } = await Promise.resolve().then(() => __importStar(require('../services/vapi-integration-service')));
        const vapiService = await VAPIIntegrationService.forOrganization(organizationId);
        if (!vapiService) {
            return res.status(400).json({
                error: 'VAPI credentials not configured for this organization'
            });
        }
        let phoneNumbers = [];
        let apiError = null;
        try {
            phoneNumbers = await vapiService.getPhoneNumbers();
            console.log('✅ Successfully fetched phone numbers from VAPI:', phoneNumbers.length);
        }
        catch (error) {
            console.error('❌ Failed to fetch phone numbers from VAPI:', error);
            apiError = error.response?.data?.message || error.message || 'Failed to fetch from VAPI';
            if (error.response?.status === 401) {
                return res.status(400).json({
                    error: 'VAPI API key is invalid or expired',
                    message: 'Please check your VAPI API key configuration',
                    details: apiError,
                    phoneNumbers: []
                });
            }
            phoneNumbers = [];
        }
        const formattedNumbers = phoneNumbers.map(number => ({
            id: number.id,
            number: number.number,
            name: number.name || number.number,
            provider: number.provider || 'twilio',
            country: number.countryCode || 'US',
            capabilities: number.capabilities || ['voice'],
            isActive: true
        }));
        res.json({
            phoneNumbers: formattedNumbers,
            ...(apiError && { warning: `VAPI API Error: ${apiError}` })
        });
    }
    catch (error) {
        console.error('❌ Error fetching phone numbers:', error);
        res.status(500).json({
            error: 'Failed to fetch phone numbers',
            message: error.message
        });
    }
});
router.get('/leads-template', async (req, res) => {
    try {
        const headers = [
            'firstName',
            'lastName',
            'phone',
            'email',
            'company',
            'title',
            'industry',
            'companySize',
            'notes'
        ];
        const sampleData = [
            'John',
            'Doe',
            '+1-555-123-4567',
            'john.doe@example.com',
            'Example Corp',
            'Sales Manager',
            'Technology',
            '100-500',
            'Interested in AI solutions'
        ];
        const csvContent = [
            headers.join(','),
            sampleData.join(',')
        ].join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="vapi-leads-template.csv"');
        res.send(csvContent);
    }
    catch (error) {
        console.error('❌ Error generating leads template:', error);
        res.status(500).json({ error: 'Failed to generate template' });
    }
});
router.get('/campaigns/:id/results', async (req, res) => {
    try {
        const { id: campaignId } = req.params;
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { data: campaign, error: campaignError } = await supabaseService
            .from('campaigns')
            .select('*')
            .eq('id', campaignId)
            .eq('organization_id', organizationId)
            .single();
        if (campaignError || !campaign) {
            return res.status(404).json({ error: 'Campaign not found' });
        }
        const { data: calls, error: callsError } = await supabaseService
            .from('calls')
            .select(`
        *,
        leads(first_name, last_name, phone, email, company, title)
      `)
            .eq('campaign_id', campaignId)
            .order('started_at', { ascending: false });
        if (callsError) {
            return res.status(500).json({ error: 'Failed to fetch call results' });
        }
        const totalCalls = calls?.length || 0;
        const callsByStatus = calls?.reduce((acc, call) => {
            acc[call.status] = (acc[call.status] || 0) + 1;
            return acc;
        }, {}) || {};
        const callsByOutcome = calls?.reduce((acc, call) => {
            if (call.outcome) {
                acc[call.outcome] = (acc[call.outcome] || 0) + 1;
            }
            return acc;
        }, {}) || {};
        const hourlyActivity = calls?.reduce((acc, call) => {
            if (call.started_at) {
                const hour = new Date(call.started_at).getHours();
                acc[hour] = (acc[hour] || 0) + 1;
            }
            return acc;
        }, {}) || {};
        const callResults = (calls || []).map(call => ({
            id: call.id,
            leadName: call.leads ? `${call.leads.first_name} ${call.leads.last_name}` : 'Unknown',
            phone: call.leads?.phone || call.phone_number,
            company: call.leads?.company,
            title: call.leads?.title,
            status: call.status,
            outcome: call.outcome,
            duration: call.duration || 0,
            cost: call.cost || 0,
            sentiment: call.sentiment,
            startedAt: call.started_at,
            endedAt: call.ended_at,
            recording: call.recording_url,
            transcript: call.transcript,
            summary: call.summary
        }));
        res.json({
            campaign: {
                id: campaign.id,
                name: campaign.name,
                status: campaign.status,
                createdAt: campaign.created_at
            },
            analytics: {
                totalCalls,
                callsByStatus,
                callsByOutcome,
                hourlyActivity,
                totalDuration: calls?.reduce((sum, call) => sum + (call.duration || 0), 0) || 0,
                totalCost: calls?.reduce((sum, call) => sum + (call.cost || 0), 0) || 0,
                averageDuration: totalCalls > 0 ?
                    (calls?.reduce((sum, call) => sum + (call.duration || 0), 0) || 0) / totalCalls : 0
            },
            results: callResults
        });
    }
    catch (error) {
        console.error('❌ Error fetching campaign results:', error);
        res.status(500).json({
            error: 'Failed to fetch campaign results',
            message: error.message
        });
    }
});
router.get('/calls/recent', async (req, res) => {
    try {
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        console.log('📞 Fetching recent calls for organization:', organizationId);
        const { data: calls, error: callsError } = await supabaseService
            .from('calls')
            .select(`
        *,
        leads(first_name, last_name, email, company, phone),
        campaigns(name)
      `)
            .eq('organization_id', organizationId)
            .order('started_at', { ascending: false })
            .limit(20);
        if (callsError) {
            console.error('❌ Error fetching recent calls:', callsError);
            return res.status(500).json({ error: 'Failed to fetch recent calls' });
        }
        const formattedCalls = calls?.map(call => ({
            id: call.id,
            vapiCallId: call.vapi_call_id,
            customerName: call.leads ? `${call.leads.first_name || ''} ${call.leads.last_name || ''}`.trim() || 'Unknown' : 'Unknown',
            customerPhone: call.phone_number,
            customerEmail: call.leads?.email,
            customerCompany: call.leads?.company,
            status: call.status,
            startedAt: call.started_at,
            endedAt: call.ended_at,
            duration: call.duration,
            cost: call.cost || 0,
            hasTranscript: !!call.transcript,
            hasRecording: !!call.recording_url
        })) || [];
        res.json({ calls: formattedCalls });
    }
    catch (error) {
        console.error('❌ Error fetching recent calls:', error);
        res.status(500).json({
            error: 'Failed to fetch recent calls',
            message: error.message
        });
    }
});
router.get('/calls/:id', async (req, res) => {
    try {
        const { id: callId } = req.params;
        const organizationId = req.user?.organizationId;
        if (!organizationId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        console.log('📞 Fetching call details:', callId);
        const { data: call, error: callError } = await supabaseService
            .from('calls')
            .select(`
        *,
        leads(first_name, last_name, email, company, phone),
        campaigns(name, description)
      `)
            .eq('id', callId)
            .eq('organization_id', organizationId)
            .single();
        if (callError || !call) {
            return res.status(404).json({ error: 'Call not found' });
        }
        let vapiCallData = null;
        if (call.vapi_call_id) {
            try {
                const outboundService = await vapi_outbound_service_1.VAPIOutboundService.forOrganization(organizationId);
                if (outboundService) {
                    vapiCallData = await outboundService.getVAPICallData(call.vapi_call_id);
                }
            }
            catch (error) {
                console.warn('⚠️ Could not fetch VAPI call data:', error);
            }
        }
        const callDetails = {
            id: call.id,
            vapiCallId: call.vapi_call_id,
            campaignId: call.campaign_id,
            campaignName: call.campaigns?.name,
            leadId: call.lead_id,
            customerName: call.customer_name,
            customerPhone: call.phone_number,
            customerEmail: call.leads?.email,
            customerCompany: call.leads?.company,
            direction: call.direction,
            status: call.status,
            startedAt: call.started_at,
            endedAt: call.ended_at,
            duration: call.duration,
            cost: call.cost || 0,
            transcript: call.transcript || vapiCallData?.transcript || null,
            summary: call.summary || vapiCallData?.summary || null,
            recording: call.recording_url || vapiCallData?.recordingUrl || null,
            metadata: call.metadata || vapiCallData?.metadata || null,
            createdAt: call.created_at,
            updatedAt: call.updated_at
        };
        res.json({ call: callDetails });
    }
    catch (error) {
        console.error('❌ Error fetching call details:', error);
        res.status(500).json({
            error: 'Failed to fetch call details',
            message: error.message
        });
    }
});
router.post('/webhooks/call-status', async (req, res) => {
    try {
        const webhookData = req.body;
        const { callId, status, transcript, summary, recordingUrl, duration, cost } = webhookData;
        console.log('🔄 Received VAPI call status webhook:', { callId, status });
        const { data: call, error: findError } = await supabaseService
            .from('calls')
            .select('*')
            .eq('vapi_call_id', callId)
            .single();
        if (findError || !call) {
            console.warn('⚠️ Call not found for webhook:', callId);
            return res.status(404).json({ error: 'Call not found' });
        }
        let dbStatus = status;
        if (status === 'ended')
            dbStatus = 'completed';
        if (status === 'no-answer')
            dbStatus = 'no_answer';
        const updateData = {
            status: dbStatus,
            updated_at: new Date().toISOString()
        };
        if (transcript)
            updateData.transcript = transcript;
        if (summary)
            updateData.summary = summary;
        if (recordingUrl)
            updateData.recording_url = recordingUrl;
        if (duration)
            updateData.duration = duration;
        if (cost)
            updateData.cost = cost;
        if (status === 'ended' || status === 'completed') {
            updateData.ended_at = new Date().toISOString();
        }
        const { error: updateError } = await supabaseService
            .from('calls')
            .update(updateData)
            .eq('id', call.id);
        if (updateError) {
            console.error('❌ Error updating call:', updateError);
            return res.status(500).json({ error: 'Failed to update call' });
        }
        if (status === 'completed' || status === 'ended') {
            await supabaseService
                .from('leads')
                .update({
                call_status: 'completed',
                last_call_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
                .eq('id', call.lead_id);
        }
        else if (status === 'failed' || status === 'no-answer' || status === 'busy') {
            await supabaseService
                .from('leads')
                .update({
                call_status: status === 'no-answer' ? 'no_answer' : status,
                last_call_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
                .eq('id', call.lead_id);
        }
        console.log('✅ Call updated successfully from webhook');
        res.json({ success: true });
    }
    catch (error) {
        console.error('❌ Error processing call webhook:', error);
        res.status(500).json({
            error: 'Failed to process webhook',
            message: error.message
        });
    }
});
router.post('/simulate-calls', async (req, res) => {
    try {
        const organizationId = req.user?.organizationId;
        const { campaignId, callIds } = req.body;
        if (!organizationId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        console.log('🎭 Manual mock call simulation requested');
        let query = supabaseService
            .from('calls')
            .select('*')
            .eq('organization_id', organizationId)
            .eq('status', 'initiated')
            .like('vapi_call_id', 'mock-call-%');
        if (campaignId) {
            query = query.eq('campaign_id', campaignId);
        }
        if (callIds && Array.isArray(callIds)) {
            query = query.in('id', callIds);
        }
        const { data: calls, error } = await query;
        if (error) {
            throw error;
        }
        if (!calls || calls.length === 0) {
            return res.json({
                message: 'No mock calls found to simulate',
                simulated: 0
            });
        }
        console.log(`🎭 Found ${calls.length} mock calls to simulate`);
        const mockWebhookService = mock_webhook_service_1.MockWebhookService.getInstance();
        let simulatedCount = 0;
        for (const call of calls) {
            try {
                await mockWebhookService.simulateCallProgression(call.vapi_call_id, organizationId);
                simulatedCount++;
                console.log(`🎭 Started simulation for call: ${call.vapi_call_id}`);
            }
            catch (error) {
                console.error(`❌ Failed to start simulation for call ${call.vapi_call_id}:`, error);
            }
        }
        res.json({
            message: `Mock call simulation started for ${simulatedCount} calls`,
            simulated: simulatedCount,
            total: calls.length,
            calls: calls.map(call => ({
                id: call.id,
                vapiCallId: call.vapi_call_id,
                customerName: call.customer_name,
                phone: call.phone_number,
                campaignId: call.campaign_id
            }))
        });
    }
    catch (error) {
        console.error('❌ Error in mock call simulation:', error);
        res.status(500).json({
            error: 'Failed to simulate mock calls',
            message: error.message
        });
    }
});
exports.default = router;
