import { Request, Response, Router } from 'express';
import { StableVapiDataService } from '../services/stable-vapi-data-service';

const router = Router();

/**
 * STABLE VAPI DATA API
 * 
 * Provides endpoints to access and manage captured VAPI webhook data
 * without dependencies on complex org structures.
 */

/**
 * GET /api/stable-vapi-data/user/:email/stats
 * Get call statistics for a specific user
 */
router.get('/user/:email/stats', async (req: Request, res: Response) => {
  try {
    const { email } = req.params;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ 
        error: 'Valid email address required' 
      });
    }

    const stats = await StableVapiDataService.getUserCallStats(email);
    
    if (!stats) {
      return res.status(404).json({ 
        error: 'No data found for user',
        email 
      });
    }

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('❌ Error getting user stats:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/stable-vapi-data/user/:email/calls
 * Get recent calls for a specific user
 */
router.get('/user/:email/calls', async (req: Request, res: Response) => {
  try {
    const { email } = req.params;
    const { limit = 10 } = req.query;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ 
        error: 'Valid email address required' 
      });
    }

    const calls = await StableVapiDataService.getUserRecentCalls(
      email, 
      parseInt(limit as string)
    );

    res.json({
      success: true,
      userEmail: email,
      calls,
      total: calls.length
    });

  } catch (error) {
    console.error('❌ Error getting user calls:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/stable-vapi-data/calls/:callId
 * Get complete data for a specific call
 */
router.get('/calls/:callId', async (req: Request, res: Response) => {
  try {
    const { callId } = req.params;
    
    const { events, summary, error } = await StableVapiDataService.getCallEvents(callId);
    
    if (error) {
      return res.status(404).json({ 
        error,
        callId 
      });
    }

    res.json({
      success: true,
      callId,
      summary,
      events,
      totalEvents: events.length
    });

  } catch (error) {
    console.error('❌ Error getting call data:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/stable-vapi-data/search
 * Search calls by transcript content
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { q: searchTerm, user_email, limit = 20 } = req.query;
    
    if (!searchTerm || typeof searchTerm !== 'string') {
      return res.status(400).json({ 
        error: 'Search term (q) is required' 
      });
    }

    const calls = await StableVapiDataService.searchCallsByTranscript(
      searchTerm,
      user_email as string,
      parseInt(limit as string)
    );

    res.json({
      success: true,
      searchTerm,
      userEmail: user_email || 'all',
      calls,
      total: calls.length
    });

  } catch (error) {
    console.error('❌ Error searching calls:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/stable-vapi-data/platform/stats
 * Get platform-wide statistics (for platform owner)
 */
router.get('/platform/stats', async (req: Request, res: Response) => {
  try {
    // Simple authentication check - only allow platform owner
    const { user_email } = req.query;
    
    if (user_email !== 'sean@artificialmedia.co.uk') {
      return res.status(403).json({ 
        error: 'Access denied - platform owner only' 
      });
    }

    const stats = await StableVapiDataService.getPlatformStats();

    res.json({
      success: true,
      platformStats: stats,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error getting platform stats:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/stable-vapi-data/export/csv
 * Export call data to CSV
 */
router.get('/export/csv', async (req: Request, res: Response) => {
  try {
    const { user_email, start_date, end_date } = req.query;
    
    const csvContent = await StableVapiDataService.exportCallsToCSV(
      user_email as string,
      start_date as string,
      end_date as string
    );

    const filename = `vapi-calls-${user_email || 'all'}-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);

  } catch (error) {
    console.error('❌ Error exporting CSV:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/stable-vapi-data/webhook-data
 * Get raw webhook data with filtering
 */
router.get('/webhook-data', async (req: Request, res: Response) => {
  try {
    const {
      user_email,
      webhook_type,
      call_status,
      start_date,
      end_date,
      limit = 50,
      offset = 0
    } = req.query;

    const { data, total, error } = await StableVapiDataService.getWebhookData({
      userEmail: user_email as string,
      webhookType: webhook_type as string,
      callStatus: call_status as string,
      startDate: start_date as string,
      endDate: end_date as string,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });

    if (error) {
      return res.status(500).json({ 
        error,
        filters: { user_email, webhook_type, call_status, start_date, end_date }
      });
    }

    res.json({
      success: true,
      data,
      total,
      filters: {
        user_email,
        webhook_type,
        call_status,
        start_date,
        end_date
      },
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: (parseInt(offset as string) + parseInt(limit as string)) < total
      }
    });

  } catch (error) {
    console.error('❌ Error getting webhook data:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/stable-vapi-data/health
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'stable-vapi-data-api',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    endpoints: {
      userStats: '/api/stable-vapi-data/user/:email/stats',
      userCalls: '/api/stable-vapi-data/user/:email/calls',
      callDetails: '/api/stable-vapi-data/calls/:callId',
      search: '/api/stable-vapi-data/search',
      platformStats: '/api/stable-vapi-data/platform/stats',
      exportCSV: '/api/stable-vapi-data/export/csv',
      webhookData: '/api/stable-vapi-data/webhook-data'
    }
  });
});

export default router;