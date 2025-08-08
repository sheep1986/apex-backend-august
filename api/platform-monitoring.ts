import express from 'express';
import { platformMonitoringService, PlatformMetrics } from '../services/platform-monitoring.service';

const router = express.Router();

/**
 * GET /api/platform-monitoring/metrics
 * Get comprehensive platform metrics
 */
router.get('/metrics', async (req: express.Request, res: express.Response) => {
  try {
    console.log('📊 Fetching platform metrics...');
    
    const metrics: PlatformMetrics = await platformMonitoringService.getPlatformMetrics();
    
    res.json({
      success: true,
      data: metrics,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error fetching platform metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch platform metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/platform-monitoring/railway
 * Get Railway-specific metrics
 */
router.get('/railway', async (req: express.Request, res: express.Response) => {
  try {
    console.log('🚂 Fetching Railway metrics...');
    
    const railwayMetrics = await platformMonitoringService.getRailwayMetrics();
    
    res.json({
      success: true,
      data: railwayMetrics,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error fetching Railway metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Railway metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/platform-monitoring/supabase
 * Get Supabase-specific metrics
 */
router.get('/supabase', async (req: express.Request, res: express.Response) => {
  try {
    console.log('🗄️ Fetching Supabase metrics...');
    
    const supabaseMetrics = await platformMonitoringService.getSupabaseMetrics();
    
    res.json({
      success: true,
      data: supabaseMetrics,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error fetching Supabase metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Supabase metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/platform-monitoring/clerk
 * Get Clerk-specific metrics
 */
router.get('/clerk', async (req: express.Request, res: express.Response) => {
  try {
    console.log('🔐 Fetching Clerk metrics...');
    
    const clerkMetrics = await platformMonitoringService.getClerkMetrics();
    
    res.json({
      success: true,
      data: clerkMetrics,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error fetching Clerk metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch Clerk metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/platform-monitoring/server
 * Get server performance metrics
 */
router.get('/server', async (req: express.Request, res: express.Response) => {
  try {
    console.log('⚡ Fetching server metrics...');
    
    const serverMetrics = await platformMonitoringService.getServerMetrics();
    
    res.json({
      success: true,
      data: serverMetrics,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error fetching server metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch server metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/platform-monitoring/railway/restart
 * Restart Railway service
 */
router.post('/railway/restart', async (req: express.Request, res: express.Response) => {
  try {
    const { serviceId } = req.body;
    
    console.log('🔄 Restarting Railway service:', serviceId || 'default');
    
    const result = await platformMonitoringService.restartRailwayService(serviceId);
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('❌ Error restarting Railway service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to restart Railway service',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/platform-monitoring/analytics/:period
 * Get analytics report for specified period
 */
router.get('/analytics/:period', async (req: express.Request, res: express.Response) => {
  try {
    const { period } = req.params;
    
    if (!['24h', '7d', '30d'].includes(period)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid period. Must be one of: 24h, 7d, 30d'
      });
    }
    
    console.log('📈 Generating analytics report for period:', period);
    
    const report = await platformMonitoringService.getAnalyticsReport(period as '24h' | '7d' | '30d');
    
    res.json({
      success: true,
      data: report,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error generating analytics report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate analytics report',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/platform-monitoring/health
 * Health check endpoint for monitoring system
 */
router.get('/health', async (req: express.Request, res: express.Response) => {
  try {
    const startTime = Date.now();
    
    // Quick health checks
    const [railwayStatus, supabaseStatus, clerkStatus, serverStatus] = await Promise.allSettled([
      platformMonitoringService.getRailwayMetrics().then(m => m.status),
      platformMonitoringService.getSupabaseMetrics().then(m => m.status),
      platformMonitoringService.getClerkMetrics().then(m => m.status),
      platformMonitoringService.getServerMetrics().then(m => m.status)
    ]);
    
    const responseTime = Date.now() - startTime;
    const overallStatus = [railwayStatus, supabaseStatus, clerkStatus, serverStatus]
      .every(result => result.status === 'fulfilled' && result.value === 'healthy') 
      ? 'healthy' : 'degraded';
    
    res.json({
      success: true,
      status: overallStatus,
      responseTime,
      services: {
        railway: railwayStatus.status === 'fulfilled' ? railwayStatus.value : 'unknown',
        supabase: supabaseStatus.status === 'fulfilled' ? supabaseStatus.value : 'unknown',
        clerk: clerkStatus.status === 'fulfilled' ? clerkStatus.value : 'unknown',
        server: serverStatus.status === 'fulfilled' ? serverStatus.value : 'unknown'
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error checking platform health:', error);
    res.status(500).json({
      success: false,
      status: 'down',
      error: 'Health check failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/platform-monitoring/status
 * Get current platform status summary
 */
router.get('/status', async (req: express.Request, res: express.Response) => {
  try {
    console.log('📋 Fetching platform status summary...');
    
    const metrics = await platformMonitoringService.getPlatformMetrics();
    
    const status = {
      overall: 'healthy' as 'healthy' | 'degraded' | 'down',
      services: {
        railway: metrics.railway.status,
        supabase: metrics.supabase.status,
        clerk: metrics.clerk.status,
        server: metrics.server.status
      },
      summary: {
        totalUsers: metrics.clerk.totalUsers,
        activeUsers: metrics.clerk.activeUsers24h,
        totalCalls: 0, // Will be populated from analytics
        activeCampaigns: 0, // Will be populated from analytics
        uptime: metrics.server.uptime,
        responseTime: metrics.server.apiResponseTime
      },
      alerts: [] as string[]
    };
    
    // Determine overall status
    const statuses = Object.values(status.services);
    if (statuses.includes('down')) {
      status.overall = 'down';
    } else if (statuses.includes('degraded')) {
      status.overall = 'degraded';
    }
    
    // Generate alerts
    if (metrics.server.cpuUsage > 80) {
      status.alerts.push('High CPU usage detected');
    }
    if (metrics.server.memoryUsage > 85) {
      status.alerts.push('High memory usage detected');
    }
    if (metrics.server.apiResponseTime > 1000) {
      status.alerts.push('Slow API response times detected');
    }
    if (metrics.supabase.errorRate > 5) {
      status.alerts.push('High database error rate detected');
    }
    
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error fetching platform status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch platform status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;