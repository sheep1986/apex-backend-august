import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import { config } from 'dotenv';
import leadsRouter from './api/leads';
import callsRouter from './api/calls';
import campaignsRouter from './api/campaigns';
import phoneNumbersRouter from './api/phone-numbers';
import organizationsRouter from './api/organizations';
// import userManagementRouter from './api/user-management'; // Disabled due to Clerk dependency
import teamManagementRouter from './api/team-management';
import messagingRouter from './api/messaging';
import notificationsRouter from './api/notifications';
import vapiWebhookEnhancedRouter from './api/vapi-webhook-enhanced';
import vapiWebhookRouter from './api/vapi-webhook';
import stableVapiWebhookRouter from './api/stable-vapi-webhook';
import stableVapiDataRouter from './api/stable-vapi-data';
import vapiOutboundRouter from './api/vapi-outbound';
import vapiAutomationWebhookRouter from './api/vapi-automation-webhook';
import campaignAutomationRouter from './api/campaign-automation';
import billingRouter from './api/billing';
import stripeWebhookRouter from './api/stripe-webhook';
import syncVapiCallRouter from './api/sync-vapi-call';
import organizationSetupRouter from './api/organization-setup-fixed';
import userProfileRouter from './api/user-profile';
import platformAnalyticsRouter from './api/platform-analytics';
import debugVapiRouter from './api/debug-vapi';
import invitationsRouter from './api/invitations';
import vapiCredentialsRouter from './api/vapi-credentials';
import testVapiRouter from './api/test-vapi';
import vapiDataRouter from './api/vapi-data';
import debugVapiTestRouter from './api/debug-vapi-test';
import debugFrontendRouter from './api/debug-frontend';
import debugVapiNoAuthRouter from './api/debug-vapi-no-auth';
import organizationSettingsRouter from './api/organization-settings';
import appointmentsRouter from './api/appointments';
import platformMonitoringRouter from './api/platform-monitoring';
import { authenticateUser } from './middleware/clerk-auth';
import { campaignExecutor } from './services/campaign-executor';
import { callCleanupService } from './services/call-cleanup-service';
import * as apiConfigurationsController from './api/api-configurations';
import { autoConfigureVAPI } from './api/vapi-auto-setup';
import { rawBodyMiddleware } from './middleware/raw-body';

// Load environment variables
config();

const app = express();
const PORT = process.env['PORT'] || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests from these origins
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
    
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 1000 : 100, // Higher limit for development
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Compression
app.use(compression());

// Body parsing middleware - Use raw body middleware for webhook routes
app.use('/api/vapi-enhanced/webhook', rawBodyMiddleware);
app.use('/api/vapi/webhook', rawBodyMiddleware);
app.use('/api/vapi-automation-webhook', rawBodyMiddleware);
app.use('/api/stable-vapi/webhook', rawBodyMiddleware);

// Regular body parsing for other routes
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Public routes (no authentication required) - MUST come before authenticated routes
app.post('/api/public/users', async (req: express.Request, res: express.Response) => {
  try {
    const { email, first_name, last_name, role, status, agency_name, phone_number, company, plan } = req.body;
    
    // Create user data
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
    
    // In mock mode, just return success
    res.status(201).json({
      id: 'mock-user-' + Date.now(),
      ...userData,
      message: 'User created successfully (mock mode - not saved to database)'
    });
    
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// API routes (require authentication)
app.use('/api/leads', authenticateUser, leadsRouter);
app.use('/api/calls', authenticateUser, callsRouter);
app.use('/api/campaigns', authenticateUser, campaignsRouter);
app.use('/api/campaign-automation', authenticateUser, campaignAutomationRouter);
app.use('/api/sync-vapi-call', authenticateUser, syncVapiCallRouter);
app.use('/api/phone-numbers', authenticateUser, phoneNumbersRouter);
app.use('/api/organizations', authenticateUser, organizationsRouter);
app.use('/api/organization-settings', authenticateUser, organizationSettingsRouter);
app.use('/api/organization-setup', organizationSetupRouter); // Keep public for initial setup
app.use('/api/user-profile', authenticateUser, userProfileRouter);
app.use('/api/platform-analytics', authenticateUser, platformAnalyticsRouter);
app.use('/api/vapi-outbound', authenticateUser, vapiOutboundRouter);
app.use('/api/debug-vapi', authenticateUser, debugVapiRouter);
app.use('/api/vapi-credentials', authenticateUser, vapiCredentialsRouter);
app.use('/api/test-vapi', authenticateUser, testVapiRouter);
app.use('/api/vapi-data', authenticateUser, vapiDataRouter);
app.use('/api/debug-vapi-test', debugVapiTestRouter); // No auth for debugging
app.use('/api/debug-frontend', debugFrontendRouter); // No auth for frontend debugging
app.use('/api/debug-vapi-no-auth', debugVapiNoAuthRouter); // No auth for VAPI debugging
app.use('/api', invitationsRouter); // Keep public for invitation acceptance
app.use('/api/messages', authenticateUser, messagingRouter);
// app.use('/api/users', userManagementRouter); // Disabled due to Clerk dependency
app.use('/api/team', authenticateUser, teamManagementRouter);
app.use('/api/notifications', authenticateUser, notificationsRouter);
app.use('/api/appointments', authenticateUser, appointmentsRouter);
app.use('/api/platform-monitoring', authenticateUser, platformMonitoringRouter);
app.use('/api/billing', billingRouter); // Some endpoints don't require auth

// API Configuration routes (user-based, authenticated)
app.get('/api/api-configurations', authenticateUser, apiConfigurationsController.getAllApiConfigurations);
app.get('/api/api-configurations/:serviceName', authenticateUser, apiConfigurationsController.getApiConfiguration);
app.post('/api/api-configurations/:serviceName', authenticateUser, apiConfigurationsController.saveApiConfiguration);
app.delete('/api/api-configurations/:serviceName', authenticateUser, apiConfigurationsController.deleteApiConfiguration);
app.get('/api/api-configurations-audit', authenticateUser, apiConfigurationsController.getConfigurationAuditLog);

// VAPI Auto-Setup route
app.post('/api/vapi-auto-setup', authenticateUser, autoConfigureVAPI);

// Webhook routes (no authentication - validated by webhook secret)
app.use('/api/vapi-enhanced', vapiWebhookEnhancedRouter); // New enhanced webhook with all fixes
app.use('/api/vapi', vapiWebhookRouter); // Keep old webhook for backward compatibility
app.use('/api/vapi-automation-webhook', vapiAutomationWebhookRouter);
app.use('/api/stable-vapi', stableVapiWebhookRouter);

// Stable VAPI data access routes (basic auth protection)
app.use('/api/stable-vapi-data', stableVapiDataRouter);

// Stripe webhook (requires raw body)
app.use('/api/stripe', express.raw({ type: 'application/json' }), stripeWebhookRouter);

// TEMPORARY DEBUG ENDPOINT - REMOVE IN PRODUCTION
app.get('/debug/org/:id/settings', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🔍 DEBUG: Fetching organization settings for:', id);

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get organization with settings directly from database
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

    // Try to get VAPI settings from multiple possible locations
    let vapiSettings: any = null;
    
    // First, try the settings.vapi path
    if (organization.settings?.vapi) {
      vapiSettings = organization.settings.vapi;
      console.log('✅ DEBUG: Found VAPI settings in settings.vapi');
    }
    // Then try the vapi_settings column
    else if (organization.vapi_settings) {
      try {
        vapiSettings = JSON.parse(organization.vapi_settings);
        console.log('✅ DEBUG: Found VAPI settings in vapi_settings column');
      } catch (parseError) {
        console.log('⚠️ DEBUG: Could not parse vapi_settings column');
      }
    }
    // Finally, try individual columns
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
  } catch (error) {
    console.error('❌ DEBUG: Error fetching organization settings:', error);
    res.status(500).json({ error: 'Internal server error', debug: true });
  }
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
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

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Apex AI Calling Platform API Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
  
  // Start campaign automation system
  console.log('🎯 Starting campaign automation system...');
  // The campaign executor starts automatically when imported
  
  console.log('🧹 Starting call cleanup service...');
  callCleanupService.start();
});

export default app; 