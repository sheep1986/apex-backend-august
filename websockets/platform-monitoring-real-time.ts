import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { platformMonitoringService } from '../services/platform-monitoring.service';
import { authenticateUser } from '../middleware/clerk-auth';

export class PlatformMonitoringRealTimeManager {
  private io: SocketIOServer;
  private updateInterval: NodeJS.Timeout | null = null;
  private connectedClients = new Set<string>();
  
  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: [
          'http://localhost:5173',
          'http://localhost:5174',
          'http://localhost:5175',
          'http://localhost:5176',
          'http://localhost:3000',
          process.env.FRONTEND_URL
        ].filter(Boolean),
        credentials: true
      },
      path: '/socket.io/platform-monitoring'
    });

    this.setupSocketHandlers();
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      console.log('📊 Client connected to platform monitoring:', socket.id);
      
      // Add to connected clients
      this.connectedClients.add(socket.id);
      
      // Send initial metrics
      this.sendMetricsToClient(socket.id);
      
      // Handle client requests
      socket.on('request-metrics', async () => {
        console.log('📊 Client requested metrics:', socket.id);
        await this.sendMetricsToClient(socket.id);
      });
      
      socket.on('request-railway-restart', async (data) => {
        console.log('🔄 Client requested Railway restart:', socket.id, data);
        
        try {
          const result = await platformMonitoringService.restartRailwayService(data.serviceId);
          
          socket.emit('railway-restart-result', {
            success: result.success,
            message: result.message,
            timestamp: new Date().toISOString()
          });
          
          // If restart was successful, broadcast to all clients
          if (result.success) {
            this.io.emit('railway-service-restarted', {
              serviceId: data.serviceId,
              message: result.message,
              timestamp: new Date().toISOString()
            });
          }
          
        } catch (error) {
          socket.emit('railway-restart-result', {
            success: false,
            message: `Failed to restart service: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: new Date().toISOString()
          });
        }
      });
      
      socket.on('request-analytics', async (data) => {
        console.log('📈 Client requested analytics:', socket.id, data);
        
        try {
          const period = data.period || '24h';
          const report = await platformMonitoringService.getAnalyticsReport(period);
          
          socket.emit('analytics-report', {
            success: true,
            data: report,
            timestamp: new Date().toISOString()
          });
          
        } catch (error) {
          socket.emit('analytics-report', {
            success: false,
            error: `Failed to generate report: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: new Date().toISOString()
          });
        }
      });
      
      // Handle disconnection
      socket.on('disconnect', () => {
        console.log('📊 Client disconnected from platform monitoring:', socket.id);
        this.connectedClients.delete(socket.id);
        
        // Stop updates if no clients connected
        if (this.connectedClients.size === 0) {
          this.stopPeriodicUpdates();
        }
      });
      
      // Start periodic updates if this is the first client
      if (this.connectedClients.size === 1) {
        this.startPeriodicUpdates();
      }
    });
  }

  private async sendMetricsToClient(clientId: string): Promise<void> {
    try {
      const metrics = await platformMonitoringService.getPlatformMetrics();
      
      this.io.to(clientId).emit('platform-metrics', {
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('❌ Failed to send metrics to client:', clientId, error);
      
      this.io.to(clientId).emit('platform-metrics', {
        success: false,
        error: 'Failed to fetch metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  }

  private async broadcastMetrics(): Promise<void> {
    if (this.connectedClients.size === 0) return;
    
    try {
      const metrics = await platformMonitoringService.getPlatformMetrics();
      
      this.io.emit('platform-metrics', {
        success: true,
        data: metrics,
        timestamp: new Date().toISOString()
      });
      
      // Check for alerts and broadcast them
      await this.checkAndBroadcastAlerts(metrics);
      
    } catch (error) {
      console.error('❌ Failed to broadcast metrics:', error);
      
      this.io.emit('platform-metrics', {
        success: false,
        error: 'Failed to fetch metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  }

  private async checkAndBroadcastAlerts(metrics: any): Promise<void> {
    const alerts: Array<{type: 'warning' | 'error' | 'info'; message: string; service: string}> = [];
    
    // Check Railway status
    if (metrics.railway.status === 'down') {
      alerts.push({
        type: 'error',
        message: 'Railway services are down',
        service: 'railway'
      });
    } else if (metrics.railway.status === 'degraded') {
      alerts.push({
        type: 'warning',
        message: 'Railway services are degraded',
        service: 'railway'
      });
    }
    
    // Check Supabase status
    if (metrics.supabase.status === 'down') {
      alerts.push({
        type: 'error',
        message: 'Supabase database is down',
        service: 'supabase'
      });
    } else if (metrics.supabase.responseTime > 2000) {
      alerts.push({
        type: 'warning',
        message: 'Supabase response time is high',
        service: 'supabase'
      });
    }
    
    // Check Clerk status
    if (metrics.clerk.status === 'down') {
      alerts.push({
        type: 'error',
        message: 'Clerk authentication is down',
        service: 'clerk'
      });
    }
    
    // Check server metrics
    if (metrics.server.status === 'down') {
      alerts.push({
        type: 'error',
        message: 'API server is down',
        service: 'server'
      });
    } else {
      if (metrics.server.cpuUsage > 80) {
        alerts.push({
          type: 'warning',
          message: 'High CPU usage detected',
          service: 'server'
        });
      }
      
      if (metrics.server.memoryUsage > 85) {
        alerts.push({
          type: 'warning',
          message: 'High memory usage detected',
          service: 'server'
        });
      }
      
      if (metrics.server.apiResponseTime > 1000) {
        alerts.push({
          type: 'warning',
          message: 'Slow API response times',
          service: 'server'
        });
      }
    }
    
    // Broadcast alerts if any
    if (alerts.length > 0) {
      this.io.emit('platform-alerts', {
        alerts,
        timestamp: new Date().toISOString()
      });
    }
  }

  private startPeriodicUpdates(): void {
    if (this.updateInterval) return;
    
    console.log('📊 Starting periodic platform monitoring updates...');
    
    // Send updates every 30 seconds
    this.updateInterval = setInterval(async () => {
      await this.broadcastMetrics();
    }, 30000);
  }

  private stopPeriodicUpdates(): void {
    if (this.updateInterval) {
      console.log('📊 Stopping periodic platform monitoring updates...');
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  public async sendManualUpdate(): Promise<void> {
    await this.broadcastMetrics();
  }

  public getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  public async sendCustomAlert(alert: {type: 'warning' | 'error' | 'info'; message: string; service: string}): Promise<void> {
    this.io.emit('platform-alerts', {
      alerts: [alert],
      timestamp: new Date().toISOString()
    });
  }
}

// Export singleton instance
export let platformMonitoringRealTimeManager: PlatformMonitoringRealTimeManager | null = null;

export function initializePlatformMonitoringRealTime(server: HTTPServer): PlatformMonitoringRealTimeManager {
  if (!platformMonitoringRealTimeManager) {
    platformMonitoringRealTimeManager = new PlatformMonitoringRealTimeManager(server);
  }
  return platformMonitoringRealTimeManager;
}