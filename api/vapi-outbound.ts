import { Router, Response } from 'express';
import { AuthenticatedRequest, authenticateUser } from '../middleware/auth';
import { VAPIOutboundService } from '../services/vapi-outbound-service';
import multer from 'multer';
import { supabaseService } from '../services/supabase-client';
import { VAPIIntegrationService } from '../services/vapi-integration-service';
import { AIConversationService } from '../services/ai-service';
import { MockWebhookService } from '../services/mock-webhook-service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Initialize AI service for call enhancement
const aiService = new AIConversationService({
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

// Apply authentication to all routes
router.use(authenticateUser);

/**
 * GET /api/vapi-outbound/campaigns
 * Get all VAPI outbound campaigns for organization
 */
router.get('/campaigns', async (req: AuthenticatedRequest, res: Response) => {
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

    // Add metrics to each campaign
    const campaignsWithMetrics = await Promise.all(
      (campaigns || []).map(async (campaign) => {
        try {
          const outboundService = await VAPIOutboundService.forOrganization(organizationId);
          const metrics = outboundService ? 
            await outboundService.getCampaignMetrics(campaign.id) : 
            {
              totalLeads: 0,
              callsAttempted: 0,
              callsConnected: 0,
              connectionRate: 0,
              activeCalls: 0,
              leadsRemaining: 0,
              totalCost: 0
            };

          return {
            id: campaign.id,
            name: campaign.name,
            description: campaign.description,
            status: campaign.status,
            assistantId: campaign.assistant_id,
            assistantName: 'AI Assistant', // Default name since we don't have the join
            phoneNumberId: campaign.phone_number_id,
            createdAt: campaign.created_at,
            updatedAt: campaign.updated_at,
            totalLeads: campaign.total_leads || 0,
            totalCalls: campaign.total_calls || 0,
            successfulCalls: campaign.successful_calls || 0,
            callsCompleted: campaign.calls_completed || 0,
            successRate: campaign.total_calls > 0 ? ((campaign.successful_calls || 0) / campaign.total_calls * 100) : 0,
            totalCost: metrics.totalCost,
            callsInProgress: metrics.activeCalls,
            metrics
          };
        } catch (error) {
          console.warn('⚠️ Error getting metrics for campaign:', campaign.id, error);
          return {
            id: campaign.id,
            name: campaign.name,
            description: campaign.description,
            status: campaign.status,
            assistantId: campaign.assistant_id,
            assistantName: 'AI Assistant',
            phoneNumberId: campaign.phone_number_id,
            createdAt: campaign.created_at,
            updatedAt: campaign.updated_at,
            totalLeads: campaign.total_leads || 0,
            totalCalls: campaign.total_calls || 0,
            successfulCalls: campaign.successful_calls || 0,
            callsCompleted: campaign.calls_completed || 0,
            successRate: 0,
            totalCost: 0,
            callsInProgress: 0,
            metrics: {
              totalLeads: 0,
              callsAttempted: 0,
              callsConnected: 0,
              connectionRate: 0,
              activeCalls: 0,
              leadsRemaining: 0,
              totalCost: 0
            }
          };
        }
      })
    );

    res.json({ campaigns: campaignsWithMetrics });
  } catch (error) {
    console.error('❌ Error in VAPI campaigns GET:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/vapi-outbound/campaigns
 * Create a new VAPI outbound campaign with CSV upload support
 */
router.post('/campaigns', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { 
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
      scheduleTime
    } = req.body;

    if (!name) {
      return res.status(400).json({ 
        error: 'Campaign name is required' 
      });
    }

    console.log('🚀 Creating VAPI outbound campaign:', name);

    // Try to get VAPI service, but proceed even if not available
    let outboundService = await VAPIOutboundService.forOrganization(organizationId);
    
    // If no VAPI credentials, create a service without VAPI integration for development
    if (!outboundService) {
      console.log('📝 No VAPI credentials found, creating development campaign');
      outboundService = new VAPIOutboundService(organizationId, null);
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
      createdBy: req.user?.id // Add user ID for created_by field
    });

    // Get the uploaded leads for display
    let leads: any[] = [];
    let metrics: any = null;
    
    if (campaign.id) {
      try {
        const campaignDashboard = await outboundService.getCampaignDashboard(campaign.id);
        leads = campaignDashboard.leads || [];
        metrics = campaignDashboard.metrics;
      } catch (error) {
        console.log('⚠️ Could not fetch campaign dashboard, but campaign created successfully');
      }
    }

    res.status(201).json({ 
      campaign,
      leads,
      metrics,
      message: 'Campaign created successfully'
    });
  } catch (error) {
    console.error('❌ Error creating VAPI campaign:', error);
    res.status(500).json({ 
      error: 'Failed to create campaign',
      message: error.message 
    });
  }
});

/**
 * GET /api/vapi-outbound/campaigns/:id
 * Get campaign details with full dashboard data
 */
router.get('/campaigns/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('📊 Fetching campaign dashboard:', id);

    const outboundService = await VAPIOutboundService.forOrganization(organizationId);
    if (!outboundService) {
      return res.status(400).json({ 
        error: 'VAPI credentials not configured for this organization' 
      });
    }

    const campaign = await outboundService.getCampaignDashboard(id);
    res.json({ campaign });
  } catch (error) {
    console.error('❌ Error fetching campaign dashboard:', error);
    res.status(500).json({ 
      error: 'Failed to fetch campaign dashboard',
      message: error.message 
    });
  }
});

/**
 * POST /api/vapi-outbound/campaigns/:id/upload-leads
 * Upload leads from CSV file to campaign
 */
router.post('/campaigns/:id/upload-leads', 
  upload.single('csvFile'), 
  async (req: AuthenticatedRequest, res: Response) => {
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

      const outboundService = await VAPIOutboundService.forOrganization(organizationId);
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
    } catch (error) {
      console.error('❌ Error uploading leads:', error);
      res.status(500).json({ 
        error: 'Failed to upload leads',
        message: error.message 
      });
    }
  }
);

/**
 * POST /api/vapi-outbound/campaigns/:id/start
 * Start a VAPI outbound campaign
 */
router.post('/campaigns/:id/start', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: campaignId } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('▶️ Starting campaign:', campaignId);

    const outboundService = await VAPIOutboundService.forOrganization(organizationId);
    if (!outboundService) {
      return res.status(400).json({ 
        error: 'VAPI credentials not configured for this organization' 
      });
    }

    await outboundService.startCampaign(campaignId);

    res.json({ message: 'Campaign started successfully' });
  } catch (error) {
    console.error('❌ Error starting campaign:', error);
    res.status(500).json({ 
      error: 'Failed to start campaign',
      message: error.message 
    });
  }
});

/**
 * POST /api/vapi-outbound/campaigns/:id/pause
 * Pause a running campaign
 */
router.post('/campaigns/:id/pause', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: campaignId } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('⏸️ Pausing campaign:', campaignId);

    const outboundService = await VAPIOutboundService.forOrganization(organizationId);
    if (!outboundService) {
      return res.status(400).json({ 
        error: 'VAPI credentials not configured for this organization' 
      });
    }

    await outboundService.pauseCampaign(campaignId);

    res.json({ message: 'Campaign paused successfully' });
  } catch (error) {
    console.error('❌ Error pausing campaign:', error);
    res.status(500).json({ 
      error: 'Failed to pause campaign',
      message: error.message 
    });
  }
});

/**
 * POST /api/vapi-outbound/campaigns/:id/resume
 * Resume a paused campaign
 */
router.post('/campaigns/:id/resume', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: campaignId } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('▶️ Resuming campaign:', campaignId);

    const outboundService = await VAPIOutboundService.forOrganization(organizationId);
    if (!outboundService) {
      return res.status(400).json({ 
        error: 'VAPI credentials not configured for this organization' 
      });
    }

    await outboundService.resumeCampaign(campaignId);

    res.json({ message: 'Campaign resumed successfully' });
  } catch (error) {
    console.error('❌ Error resuming campaign:', error);
    res.status(500).json({ 
      error: 'Failed to resume campaign',
      message: error.message 
    });
  }
});

/**
 * GET /api/vapi-outbound/campaigns/:id/live
 * Get live campaign monitoring data
 */
router.get('/campaigns/:id/live', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: campaignId } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const outboundService = await VAPIOutboundService.forOrganization(organizationId);
    if (!outboundService) {
      return res.status(400).json({ 
        error: 'VAPI credentials not configured for this organization' 
      });
    }

    const liveData = await outboundService.getLiveCampaignData(campaignId);

    res.json(liveData);
  } catch (error) {
    console.error('❌ Error fetching live campaign data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch live campaign data',
      message: error.message 
    });
  }
});

/**
 * GET /api/vapi-outbound/campaigns/:id/calls
 * Get all calls for a specific campaign
 */
router.get('/campaigns/:id/calls', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: campaignId } = req.params;
    const organizationId = req.user?.organizationId;
    const { page = '1', limit = '50', status, sortBy = 'started_at', sortOrder = 'desc' } = req.query;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`📞 Fetching calls for campaign: ${campaignId}`);

    // Verify campaign belongs to organization
    const { data: campaign, error: campaignError } = await supabaseService
      .from('campaigns')
      .select('id, name')
      .eq('id', campaignId)
      .eq('organization_id', organizationId)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Build query for calls
    let query = supabaseService
      .from('calls')
      .select(`
        id,
        vapi_call_id,
        lead_id,
        phone_number,
        direction,
        status,
        started_at,
        ended_at,
        duration,
        cost,
        transcript,
        summary,
        recording,
        sentiment_score,
        leads!inner(first_name, last_name, email, company)
      `)
      .eq('campaign_id', campaignId)
      .eq('organization_id', organizationId);

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    // Apply sorting
    const validSortFields = ['started_at', 'ended_at', 'duration', 'cost'];
    const sortField = validSortFields.includes(sortBy as string) ? sortBy : 'started_at';
    const order = sortOrder === 'asc' ? 'asc' : 'desc';
    
    query = query.order(sortField as string, { ascending: order === 'asc' });

    // Apply pagination
    const offset = (Number(page) - 1) * Number(limit);
    query = query.range(offset, offset + Number(limit) - 1);

    const { data: calls, error: callsError } = await query;

    if (callsError) {
      throw callsError;
    }

    // Transform the data for frontend consumption with AI enhancement
    const transformedCalls = await Promise.all(
      calls?.map(async (call) => {
        // Extract customer name using AI if transcript available
        let customerName = call.leads ? `${call.leads.first_name} ${call.leads.last_name}`.trim() : 'Unknown';
        
        if (call.transcript && customerName === 'Unknown') {
          try {
            const aiExtractedName = await aiService.extractCustomerName(call.transcript);
            if (aiExtractedName) {
              customerName = aiExtractedName;
            }
          } catch (error) {
            console.warn('Failed to extract customer name with AI:', error);
          }
        }

        // Format transcript with AI if available
        let formattedTranscript;
        if (call.transcript) {
          try {
            formattedTranscript = await aiService.formatTranscript(call.transcript);
          } catch (error) {
            console.warn('Failed to format transcript with AI:', error);
            formattedTranscript = null;
          }
        } else {
          formattedTranscript = null;
        }

        return {
          id: call.id,
          vapiCallId: call.vapi_call_id,
          customerName,
          customerPhone: call.phone_number,
          customerEmail: call.leads?.email || null,
          customerCompany: call.leads?.company || null,
          status: call.status,
          startedAt: call.started_at,
          endedAt: call.ended_at,
          duration: call.duration || 0,
          cost: call.cost || 0,
          hasTranscript: !!(call.transcript),
          hasRecording: !!(call.recording),
          sentiment: call.sentiment_score || 'neutral',
          transcript: call.transcript,
          formattedTranscript,
          summary: call.summary,
          recording: call.recording
        };
      }) || []
    );

    // Get total count for pagination
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

  } catch (error) {
    console.error('❌ Error fetching campaign calls:', error);
    res.status(500).json({ 
      error: 'Failed to fetch campaign calls',
      message: error.message 
    });
  }
});

/**
 * GET /api/vapi-outbound/assistants
 * Get available VAPI assistants for organization
 */
router.get('/assistants', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('🤖 Fetching VAPI assistants for organization');

    // Get organization's VAPI service
    const { VAPIIntegrationService } = await import('../services/vapi-integration-service');
    const vapiService = await VAPIIntegrationService.forOrganization(organizationId);
    
    if (!vapiService) {
      return res.status(400).json({ 
        error: 'VAPI credentials not configured for this organization' 
      });
    }

    // Get assistants from VAPI
    let assistants: any[] = [];
    try {
      assistants = await vapiService.listAssistants();
      console.log('✅ Successfully fetched assistants from VAPI:', assistants.length);
    } catch (error) {
      console.error('❌ Failed to fetch assistants from VAPI:', error);
      // Return empty array - only use real VAPI data
      assistants = [];
    }

    // Also get from local database
    const { data: localAssistants } = await supabaseService
      .from('vapi_assistants')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    // Combine and format data
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

    res.json({ assistants: formattedAssistants });
  } catch (error) {
    console.error('❌ Error fetching assistants:', error);
    res.status(500).json({ 
      error: 'Failed to fetch assistants',
      message: error.message 
    });
  }
});

/**
 * GET /api/vapi-outbound/phone-numbers
 * Get available VAPI phone numbers for organization
 */
router.get('/phone-numbers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('📞 Fetching VAPI phone numbers for organization');

    // Get organization's VAPI service
    const { VAPIIntegrationService } = await import('../services/vapi-integration-service');
    const vapiService = await VAPIIntegrationService.forOrganization(organizationId);
    
    if (!vapiService) {
      return res.status(400).json({ 
        error: 'VAPI credentials not configured for this organization' 
      });
    }

    // Get phone numbers from VAPI
    let phoneNumbers: any[] = [];
    try {
      phoneNumbers = await vapiService.getPhoneNumbers();
      console.log('✅ Successfully fetched phone numbers from VAPI:', phoneNumbers.length);
    } catch (error) {
      console.error('❌ Failed to fetch phone numbers from VAPI:', error);
      // Return empty array - only use real VAPI data
      phoneNumbers = [];
    }

    // Format data
    const formattedNumbers = phoneNumbers.map(number => ({
      id: number.id,
      number: number.number,
      name: number.name || number.number,
      provider: number.provider || 'twilio',
      country: number.countryCode || 'US',
      capabilities: number.capabilities || ['voice'],
      isActive: true
    }));

    res.json({ phoneNumbers: formattedNumbers });
  } catch (error) {
    console.error('❌ Error fetching phone numbers:', error);
    res.status(500).json({ 
      error: 'Failed to fetch phone numbers',
      message: error.message 
    });
  }
});

/**
 * GET /api/vapi-outbound/leads-template
 * Download CSV template for lead upload
 */
router.get('/leads-template', async (req: AuthenticatedRequest, res: Response) => {
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
  } catch (error) {
    console.error('❌ Error generating leads template:', error);
    res.status(500).json({ error: 'Failed to generate template' });
  }
});

/**
 * GET /api/vapi-outbound/campaigns/:id/results
 * Get detailed campaign results and analytics
 */
router.get('/campaigns/:id/results', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: campaignId } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get campaign with all related data
    const { data: campaign, error: campaignError } = await supabaseService
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('organization_id', organizationId)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Get all calls with details
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

    // Calculate detailed analytics
    const totalCalls = calls?.length || 0;
    const callsByStatus = calls?.reduce((acc, call) => {
      acc[call.status] = (acc[call.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    const callsByOutcome = calls?.reduce((acc, call) => {
      if (call.outcome) {
        acc[call.outcome] = (acc[call.outcome] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>) || {};

    const hourlyActivity = calls?.reduce((acc, call) => {
      if (call.started_at) {
        const hour = new Date(call.started_at).getHours();
        acc[hour] = (acc[hour] || 0) + 1;
      }
      return acc;
    }, {} as Record<number, number>) || {};

    // Transform calls for frontend
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

  } catch (error) {
    console.error('❌ Error fetching campaign results:', error);
    res.status(500).json({ 
      error: 'Failed to fetch campaign results',
      message: error.message 
    });
  }
});

/**
 * GET /api/vapi-outbound/calls/recent
 * Get recent calls across all campaigns
 */
router.get('/calls/recent', async (req: AuthenticatedRequest, res: Response) => {
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

    // Format calls for frontend
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
  } catch (error) {
    console.error('❌ Error fetching recent calls:', error);
    res.status(500).json({ 
      error: 'Failed to fetch recent calls',
      message: error.message 
    });
  }
});

/**
 * GET /api/vapi-outbound/calls/:id
 * Get detailed call information including transcript and recording
 */
router.get('/calls/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id: callId } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('📞 Fetching call details:', callId);

    // Get call details from database
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

    // Get VAPI call data if available
    let vapiCallData: any = null;
    if (call.vapi_call_id) {
      try {
        const outboundService = await VAPIOutboundService.forOrganization(organizationId);
        if (outboundService) {
          vapiCallData = await outboundService.getVAPICallData(call.vapi_call_id);
        }
      } catch (error) {
        console.warn('⚠️ Could not fetch VAPI call data:', error);
      }
    }

    // Combine database and VAPI data
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
  } catch (error) {
    console.error('❌ Error fetching call details:', error);
    res.status(500).json({ 
      error: 'Failed to fetch call details',
      message: error.message 
    });
  }
});

/**
 * POST /api/vapi-outbound/webhooks/call-status
 * Handle VAPI call status webhooks
 */
router.post('/webhooks/call-status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const webhookData = req.body as {
      callId: string;
      status: string;
      transcript?: string;
      summary?: string;
      recordingUrl?: string;
      duration?: number;
      cost?: number;
    };

    const { callId, status, transcript, summary, recordingUrl, duration, cost } = webhookData;

    console.log('🔄 Received VAPI call status webhook:', { callId, status });

    // Find the call in our database
    const { data: call, error: findError } = await supabaseService
      .from('calls')
      .select('*')
      .eq('vapi_call_id', callId)
      .single();

    if (findError || !call) {
      console.warn('⚠️ Call not found for webhook:', callId);
      return res.status(404).json({ error: 'Call not found' });
    }

    // Map VAPI status to our database status
    let dbStatus = status;
    if (status === 'ended') dbStatus = 'completed';
    if (status === 'no-answer') dbStatus = 'no_answer';

    // Update call with new information
    const updateData: any = {
      status: dbStatus,
      updated_at: new Date().toISOString()
    };

    if (transcript) updateData.transcript = transcript;
    if (summary) updateData.summary = summary;
    if (recordingUrl) updateData.recording_url = recordingUrl;
    if (duration) updateData.duration = duration;
    if (cost) updateData.cost = cost;
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

    // Update lead status based on call outcome
    if (status === 'completed' || status === 'ended') {
      await supabaseService
        .from('leads')
        .update({
          call_status: 'completed',
          last_call_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', call.lead_id);
    } else if (status === 'failed' || status === 'no-answer' || status === 'busy') {
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
  } catch (error) {
    console.error('❌ Error processing call webhook:', error);
    res.status(500).json({ 
      error: 'Failed to process webhook',
      message: error.message 
    });
  }
});

/**
 * POST /api/vapi-outbound/simulate-calls
 * Manually trigger mock call simulations for development
 */
router.post('/simulate-calls', async (req: AuthenticatedRequest, res: Response) => {
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

    // Filter by campaign if provided
    if (campaignId) {
      query = query.eq('campaign_id', campaignId);
    }

    // Filter by specific call IDs if provided
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

    // Start simulation for each call
    const mockWebhookService = MockWebhookService.getInstance();
    let simulatedCount = 0;

    for (const call of calls) {
      try {
        await mockWebhookService.simulateCallProgression(call.vapi_call_id, organizationId);
        simulatedCount++;
        console.log(`🎭 Started simulation for call: ${call.vapi_call_id}`);
      } catch (error) {
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

  } catch (error) {
    console.error('❌ Error in mock call simulation:', error);
    res.status(500).json({ 
      error: 'Failed to simulate mock calls',
      message: error.message 
    });
  }
});

export default router; 