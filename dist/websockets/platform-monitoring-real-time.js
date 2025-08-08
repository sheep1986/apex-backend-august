"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformMonitoringRealTimeManager = exports.PlatformMonitoringRealTimeManager = void 0;
exports.initializePlatformMonitoringRealTime = initializePlatformMonitoringRealTime;
const socket_io_1 = require("socket.io");
const platform_monitoring_service_1 = require("../services/platform-monitoring.service");
class PlatformMonitoringRealTimeManager {
    constructor(server) {
        this.updateInterval = null;
        this.connectedClients = new Set();
        this.io = new socket_io_1.Server(server, {
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
    setupSocketHandlers() {
        this.io.on('connection', (socket) => {
            console.log('📊 Client connected to platform monitoring:', socket.id);
            this.connectedClients.add(socket.id);
            this.sendMetricsToClient(socket.id);
            socket.on('request-metrics', async () => {
                console.log('📊 Client requested metrics:', socket.id);
                await this.sendMetricsToClient(socket.id);
            });
            socket.on('request-railway-restart', async (data) => {
                console.log('🔄 Client requested Railway restart:', socket.id, data);
                try {
                    const result = await platform_monitoring_service_1.platformMonitoringService.restartRailwayService(data.serviceId);
                    socket.emit('railway-restart-result', {
                        success: result.success,
                        message: result.message,
                        timestamp: new Date().toISOString()
                    });
                    if (result.success) {
                        this.io.emit('railway-service-restarted', {
                            serviceId: data.serviceId,
                            message: result.message,
                            timestamp: new Date().toISOString()
                        });
                    }
                }
                catch (error) {
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
                    const report = await platform_monitoring_service_1.platformMonitoringService.getAnalyticsReport(period);
                    socket.emit('analytics-report', {
                        success: true,
                        data: report,
                        timestamp: new Date().toISOString()
                    });
                }
                catch (error) {
                    socket.emit('analytics-report', {
                        success: false,
                        error: `Failed to generate report: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        timestamp: new Date().toISOString()
                    });
                }
            });
            socket.on('disconnect', () => {
                console.log('📊 Client disconnected from platform monitoring:', socket.id);
                this.connectedClients.delete(socket.id);
                if (this.connectedClients.size === 0) {
                    this.stopPeriodicUpdates();
                }
            });
            if (this.connectedClients.size === 1) {
                this.startPeriodicUpdates();
            }
        });
    }
    async sendMetricsToClient(clientId) {
        try {
            const metrics = await platform_monitoring_service_1.platformMonitoringService.getPlatformMetrics();
            this.io.to(clientId).emit('platform-metrics', {
                success: true,
                data: metrics,
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            console.error('❌ Failed to send metrics to client:', clientId, error);
            this.io.to(clientId).emit('platform-metrics', {
                success: false,
                error: 'Failed to fetch metrics',
                message: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            });
        }
    }
    async broadcastMetrics() {
        if (this.connectedClients.size === 0)
            return;
        try {
            const metrics = await platform_monitoring_service_1.platformMonitoringService.getPlatformMetrics();
            this.io.emit('platform-metrics', {
                success: true,
                data: metrics,
                timestamp: new Date().toISOString()
            });
            await this.checkAndBroadcastAlerts(metrics);
        }
        catch (error) {
            console.error('❌ Failed to broadcast metrics:', error);
            this.io.emit('platform-metrics', {
                success: false,
                error: 'Failed to fetch metrics',
                message: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            });
        }
    }
    async checkAndBroadcastAlerts(metrics) {
        const alerts = [];
        if (metrics.railway.status === 'down') {
            alerts.push({
                type: 'error',
                message: 'Railway services are down',
                service: 'railway'
            });
        }
        else if (metrics.railway.status === 'degraded') {
            alerts.push({
                type: 'warning',
                message: 'Railway services are degraded',
                service: 'railway'
            });
        }
        if (metrics.supabase.status === 'down') {
            alerts.push({
                type: 'error',
                message: 'Supabase database is down',
                service: 'supabase'
            });
        }
        else if (metrics.supabase.responseTime > 2000) {
            alerts.push({
                type: 'warning',
                message: 'Supabase response time is high',
                service: 'supabase'
            });
        }
        if (metrics.clerk.status === 'down') {
            alerts.push({
                type: 'error',
                message: 'Clerk authentication is down',
                service: 'clerk'
            });
        }
        if (metrics.server.status === 'down') {
            alerts.push({
                type: 'error',
                message: 'API server is down',
                service: 'server'
            });
        }
        else {
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
        if (alerts.length > 0) {
            this.io.emit('platform-alerts', {
                alerts,
                timestamp: new Date().toISOString()
            });
        }
    }
    startPeriodicUpdates() {
        if (this.updateInterval)
            return;
        console.log('📊 Starting periodic platform monitoring updates...');
        this.updateInterval = setInterval(async () => {
            await this.broadcastMetrics();
        }, 30000);
    }
    stopPeriodicUpdates() {
        if (this.updateInterval) {
            console.log('📊 Stopping periodic platform monitoring updates...');
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
    async sendManualUpdate() {
        await this.broadcastMetrics();
    }
    getConnectedClientsCount() {
        return this.connectedClients.size;
    }
    async sendCustomAlert(alert) {
        this.io.emit('platform-alerts', {
            alerts: [alert],
            timestamp: new Date().toISOString()
        });
    }
}
exports.PlatformMonitoringRealTimeManager = PlatformMonitoringRealTimeManager;
exports.platformMonitoringRealTimeManager = null;
function initializePlatformMonitoringRealTime(server) {
    if (!exports.platformMonitoringRealTimeManager) {
        exports.platformMonitoringRealTimeManager = new PlatformMonitoringRealTimeManager(server);
    }
    return exports.platformMonitoringRealTimeManager;
}
