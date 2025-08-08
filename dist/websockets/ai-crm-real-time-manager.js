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
exports.AiCrmRealTimeManager = void 0;
const ws_1 = require("ws");
const events_1 = require("events");
const jwt = __importStar(require("jsonwebtoken"));
const url_1 = require("url");
const ioredis_1 = __importDefault(require("ioredis"));
class AiCrmRealTimeManager extends events_1.EventEmitter {
    constructor(server, pool, redisUrl) {
        super();
        this.pool = pool;
        this.clients = new Map();
        this.subscriptions = new Map();
        this.jwtSecret = process.env.JWT_SECRET || 'default-secret';
        this.redis = new ioredis_1.default(redisUrl || 'redis://localhost:6379');
        this.wss = new ws_1.WebSocketServer({
            server,
            path: '/ws/ai-crm',
            verifyClient: this.verifyClient.bind(this)
        });
        this.setupWebSocketServer();
        this.setupRedisSubscriptions();
        this.startHeartbeat();
        this.startCleanup();
        this.startMetricsCollection();
    }
    setupWebSocketServer() {
        this.wss.on('connection', (ws, request) => {
            this.handleConnection(ws, request);
        });
        this.wss.on('error', (error) => {
            console.error('WebSocket server error:', error);
        });
        console.log('🚀 AI CRM Real-time WebSocket server started on /ws/ai-crm');
    }
    setupRedisSubscriptions() {
        this.redis.subscribe('ai-crm:call:events', (err, count) => {
            if (err) {
                console.error('Redis subscription error:', err);
            }
            else {
                console.log(`📡 Subscribed to ${count} Redis channels`);
            }
        });
        this.redis.on('message', (channel, message) => {
            try {
                const data = JSON.parse(message);
                this.handleRedisMessage(channel, data);
            }
            catch (error) {
                console.error('Redis message parsing error:', error);
            }
        });
        this.redis.subscribe('ai-crm:lead:events', 'ai-crm:campaign:events', 'ai-crm:compliance:alerts', 'ai-crm:export:events', 'ai-crm:analytics:updates');
    }
    handleRedisMessage(channel, data) {
        switch (channel) {
            case 'ai-crm:call:events':
                this.handleCallEvent(data);
                break;
            case 'ai-crm:lead:events':
                this.handleLeadEvent(data);
                break;
            case 'ai-crm:campaign:events':
                this.handleCampaignEvent(data);
                break;
            case 'ai-crm:compliance:alerts':
                this.handleComplianceAlert(data);
                break;
            case 'ai-crm:export:events':
                this.handleExportEvent(data);
                break;
            case 'ai-crm:analytics:updates':
                this.handleAnalyticsUpdate(data);
                break;
        }
    }
    verifyClient(info) {
        try {
            const url = new url_1.URL(info.req.url, 'http://localhost');
            const token = url.searchParams.get('token');
            if (!token) {
                return false;
            }
            jwt.verify(token, this.jwtSecret);
            return true;
        }
        catch (error) {
            console.error('WebSocket client verification failed:', error);
            return false;
        }
    }
    async handleConnection(ws, request) {
        const clientId = this.generateClientId();
        try {
            const url = new url_1.URL(request.url, 'http://localhost');
            const token = url.searchParams.get('token');
            const decoded = jwt.verify(token, this.jwtSecret);
            const client = {
                id: clientId,
                ws,
                userId: decoded.userId || decoded.sub,
                accountId: decoded.accountId,
                campaignId: url.searchParams.get('campaignId') || undefined,
                subscriptions: new Set(),
                lastHeartbeat: new Date(),
                authenticated: true,
                metadata: {
                    userAgent: request.headers['user-agent'],
                    ip: request.socket.remoteAddress,
                    connectedAt: new Date(),
                    role: decoded.role || 'agent'
                }
            };
            this.clients.set(clientId, client);
            ws.on('message', (data) => {
                this.handleMessage(clientId, data);
            });
            ws.on('close', () => {
                this.handleDisconnection(clientId);
            });
            ws.on('error', (error) => {
                console.error(`WebSocket client ${clientId} error:`, error);
                this.handleDisconnection(clientId);
            });
            this.sendToClient(clientId, {
                type: 'connected',
                data: {
                    clientId,
                    serverTime: new Date().toISOString(),
                    subscriptions: [],
                    features: ['calls', 'leads', 'campaigns', 'analytics', 'compliance', 'exports']
                }
            });
            console.log(`📡 AI CRM client ${clientId} connected (user: ${decoded.userId || decoded.sub})`);
            if (client.accountId) {
                await this.handleSubscribe(clientId, {
                    type: 'campaign',
                    resourceId: 'account:' + client.accountId
                });
            }
            if (client.campaignId) {
                await this.handleSubscribe(clientId, {
                    type: 'campaign',
                    resourceId: client.campaignId
                });
            }
            this.emit('client_connected', {
                clientId,
                userId: decoded.userId || decoded.sub,
                accountId: decoded.accountId,
                campaignId: client.campaignId
            });
        }
        catch (error) {
            console.error('WebSocket connection error:', error);
            ws.close(1000, 'Authentication failed');
        }
    }
    async handleMessage(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        try {
            const message = JSON.parse(data.toString());
            client.lastHeartbeat = new Date();
            switch (message.type) {
                case 'subscribe':
                    await this.handleSubscribe(clientId, message.data);
                    break;
                case 'unsubscribe':
                    await this.handleUnsubscribe(clientId, message.data);
                    break;
                case 'ping':
                    this.sendToClient(clientId, { type: 'pong', data: { timestamp: new Date().toISOString() } });
                    break;
                case 'get_campaign_metrics':
                    await this.handleGetCampaignMetrics(clientId, message.data);
                    break;
                case 'get_active_calls':
                    await this.handleGetActiveCalls(clientId, message.data);
                    break;
                case 'get_qualified_leads':
                    await this.handleGetQualifiedLeads(clientId, message.data);
                    break;
                case 'trigger_export':
                    await this.handleTriggerExport(clientId, message.data);
                    break;
                default:
                    console.warn(`Unknown message type: ${message.type}`);
            }
        }
        catch (error) {
            console.error(`Message handling error for client ${clientId}:`, error);
            this.sendToClient(clientId, {
                type: 'error',
                data: { message: 'Invalid message format', error: error.message }
            });
        }
    }
    handleCallEvent(data) {
        const { callId, leadId, campaignId, status } = data;
        this.broadcastToCampaign(campaignId, {
            type: 'call_update',
            data: {
                callId,
                leadId,
                campaignId,
                status,
                duration: data.duration,
                cost: data.cost,
                qualification_score: data.qualification_score,
                timestamp: data.timestamp
            }
        });
        this.broadcastToSubscribers(`call:${callId}`, {
            type: 'call_detail_update',
            data: {
                ...data,
                transcript: data.transcript,
                recording_url: data.recording_url
            }
        });
    }
    handleLeadEvent(data) {
        const { leadId, campaignId, status } = data;
        this.broadcastToCampaign(campaignId, {
            type: 'lead_update',
            data: {
                leadId,
                campaignId,
                status,
                qualification_score: data.qualification_score,
                interest_level: data.interest_level,
                next_steps: data.next_steps,
                timestamp: data.timestamp
            }
        });
        if (status === 'qualified') {
            this.broadcastToCampaign(campaignId, {
                type: 'lead_qualified',
                data: {
                    leadId,
                    campaignId,
                    qualification_score: data.qualification_score,
                    timestamp: data.timestamp
                }
            });
        }
    }
    handleCampaignEvent(data) {
        const { campaignId } = data;
        this.broadcastToCampaign(campaignId, {
            type: 'campaign_metrics_update',
            data: {
                campaignId,
                metrics: {
                    total_leads: data.total_leads,
                    active_calls: data.active_calls,
                    qualified_leads: data.qualified_leads,
                    total_cost: data.total_cost,
                    connection_rate: data.connection_rate,
                    qualification_rate: data.qualification_rate,
                    calls_today: data.calls_today
                },
                timestamp: data.timestamp
            }
        });
    }
    handleComplianceAlert(data) {
        const { campaign_id, severity, type } = data;
        this.broadcastToCampaign(campaign_id, {
            type: 'compliance_alert',
            data: {
                alertId: data.id,
                type,
                severity,
                phone_number: data.phone_number,
                reason: data.reason,
                timestamp: data.timestamp
            }
        });
        if (severity === 'critical') {
            this.broadcastToAccount(campaign_id, {
                type: 'critical_compliance_alert',
                data: {
                    alertId: data.id,
                    type,
                    campaign_id,
                    phone_number: data.phone_number,
                    reason: data.reason,
                    timestamp: data.timestamp
                }
            });
        }
    }
    handleExportEvent(data) {
        const { exportId, campaignId, status, userId } = data;
        this.sendToUser(userId, {
            type: 'export_update',
            data: {
                exportId,
                campaignId,
                status,
                downloadUrl: data.downloadUrl,
                recordCount: data.recordCount,
                timestamp: new Date()
            }
        });
    }
    handleAnalyticsUpdate(data) {
        const { accountId, campaignId, analytics } = data;
        if (campaignId) {
            this.broadcastToCampaign(campaignId, {
                type: 'analytics_update',
                data: {
                    campaignId,
                    analytics,
                    timestamp: new Date()
                }
            });
        }
        else {
            this.broadcastToAccount(accountId, {
                type: 'analytics_update',
                data: {
                    analytics,
                    timestamp: new Date()
                }
            });
        }
    }
    async handleSubscribe(clientId, subscription) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        try {
            const resourceId = `${subscription.type}:${subscription.resourceId}`;
            const canSubscribe = await this.checkSubscriptionAuthorization(client, subscription);
            if (!canSubscribe) {
                this.sendToClient(clientId, {
                    type: 'subscription_denied',
                    data: { resourceId, reason: 'Unauthorized' }
                });
                return;
            }
            client.subscriptions.add(resourceId);
            if (!this.subscriptions.has(resourceId)) {
                this.subscriptions.set(resourceId, new Set());
            }
            this.subscriptions.get(resourceId).add(clientId);
            this.sendToClient(clientId, {
                type: 'subscribed',
                data: { resourceId, subscription }
            });
            await this.sendInitialData(clientId, subscription);
            console.log(`📡 Client ${clientId} subscribed to ${resourceId}`);
        }
        catch (error) {
            console.error(`Subscription error for client ${clientId}:`, error);
            this.sendToClient(clientId, {
                type: 'subscription_error',
                data: { error: error.message }
            });
        }
    }
    async handleUnsubscribe(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        const resourceId = `${data.type}:${data.resourceId}`;
        client.subscriptions.delete(resourceId);
        const subscribers = this.subscriptions.get(resourceId);
        if (subscribers) {
            subscribers.delete(clientId);
            if (subscribers.size === 0) {
                this.subscriptions.delete(resourceId);
            }
        }
        this.sendToClient(clientId, {
            type: 'unsubscribed',
            data: { resourceId }
        });
    }
    async handleGetCampaignMetrics(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        try {
            const { campaignId } = data;
            const metrics = await this.getCampaignMetrics(campaignId);
            this.sendToClient(clientId, {
                type: 'campaign_metrics',
                data: { campaignId, metrics }
            });
        }
        catch (error) {
            this.sendToClient(clientId, {
                type: 'error',
                data: { message: 'Failed to get campaign metrics', error: error.message }
            });
        }
    }
    async handleGetActiveCalls(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        try {
            const { campaignId } = data;
            const activeCalls = await this.getActiveCalls(campaignId);
            this.sendToClient(clientId, {
                type: 'active_calls',
                data: { campaignId, activeCalls }
            });
        }
        catch (error) {
            this.sendToClient(clientId, {
                type: 'error',
                data: { message: 'Failed to get active calls', error: error.message }
            });
        }
    }
    async handleGetQualifiedLeads(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        try {
            const { campaignId, limit = 10 } = data;
            const qualifiedLeads = await this.getQualifiedLeads(campaignId, limit);
            this.sendToClient(clientId, {
                type: 'qualified_leads',
                data: { campaignId, qualifiedLeads }
            });
        }
        catch (error) {
            this.sendToClient(clientId, {
                type: 'error',
                data: { message: 'Failed to get qualified leads', error: error.message }
            });
        }
    }
    async handleTriggerExport(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        try {
            await this.redis.publish('ai-crm:export:requests', JSON.stringify({
                userId: client.userId,
                campaignId: data.campaignId,
                exportType: data.exportType,
                format: data.format,
                requestedAt: new Date()
            }));
            this.sendToClient(clientId, {
                type: 'export_requested',
                data: { message: 'Export request submitted' }
            });
        }
        catch (error) {
            this.sendToClient(clientId, {
                type: 'error',
                data: { message: 'Failed to trigger export', error: error.message }
            });
        }
    }
    broadcastToCampaign(campaignId, message) {
        const resourceId = `campaign:${campaignId}`;
        this.broadcastToSubscribers(resourceId, message);
    }
    broadcastToAccount(accountId, message) {
        const resourceId = `account:${accountId}`;
        this.broadcastToSubscribers(resourceId, message);
    }
    broadcastToSubscribers(resourceId, message) {
        const subscribers = this.subscriptions.get(resourceId);
        if (!subscribers)
            return;
        const fullMessage = {
            ...message,
            timestamp: new Date().toISOString()
        };
        subscribers.forEach(clientId => {
            this.sendToClient(clientId, fullMessage);
        });
    }
    sendToUser(userId, message) {
        this.clients.forEach((client, clientId) => {
            if (client.userId === userId) {
                this.sendToClient(clientId, message);
            }
        });
    }
    sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client || client.ws.readyState !== ws_1.WebSocket.OPEN) {
            return;
        }
        const fullMessage = {
            type: message.type || 'message',
            data: message.data || {},
            timestamp: new Date().toISOString(),
            clientId
        };
        try {
            client.ws.send(JSON.stringify(fullMessage));
        }
        catch (error) {
            console.error(`Failed to send message to client ${clientId}:`, error);
        }
    }
    async getCampaignMetrics(campaignId) {
        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT * FROM get_campaign_metrics($1)', [campaignId]);
            return result.rows[0];
        }
        finally {
            client.release();
        }
    }
    async getActiveCalls(campaignId) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
        SELECT 
          vca.vapi_call_id,
          vca.status,
          vca.started_at,
          vca.duration_seconds,
          l.first_name,
          l.last_name,
          l.phone_number
        FROM vapi_call_attempts vca
        JOIN crm_leads l ON l.id = vca.lead_id
        WHERE vca.campaign_id = $1
        AND vca.status IN ('initiated', 'ringing', 'connected')
        ORDER BY vca.started_at DESC
      `, [campaignId]);
            return result.rows;
        }
        finally {
            client.release();
        }
    }
    async getQualifiedLeads(campaignId, limit) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
        SELECT 
          ql.*,
          l.first_name,
          l.last_name,
          l.phone_number,
          l.company
        FROM qualified_leads ql
        JOIN crm_leads l ON l.id = ql.lead_id
        WHERE ql.campaign_id = $1
        ORDER BY ql.qualification_score DESC, ql.created_at DESC
        LIMIT $2
      `, [campaignId, limit]);
            return result.rows;
        }
        finally {
            client.release();
        }
    }
    async checkSubscriptionAuthorization(client, subscription) {
        return client.authenticated;
    }
    async sendInitialData(clientId, subscription) {
        switch (subscription.type) {
            case 'campaign':
                if (subscription.resourceId.startsWith('account:')) {
                }
                else {
                    await this.handleGetCampaignMetrics(clientId, { campaignId: subscription.resourceId });
                }
                break;
        }
    }
    generateClientId() {
        return `ai-crm-client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    handleDisconnection(clientId) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        client.subscriptions.forEach(resourceId => {
            const subscribers = this.subscriptions.get(resourceId);
            if (subscribers) {
                subscribers.delete(clientId);
                if (subscribers.size === 0) {
                    this.subscriptions.delete(resourceId);
                }
            }
        });
        this.clients.delete(clientId);
        console.log(`📡 AI CRM client ${clientId} disconnected`);
        this.emit('client_disconnected', {
            clientId,
            userId: client.userId,
            accountId: client.accountId
        });
    }
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.clients.forEach((client, clientId) => {
                if (client.ws.readyState === ws_1.WebSocket.OPEN) {
                    try {
                        client.ws.ping();
                    }
                    catch (error) {
                        console.error(`Heartbeat failed for client ${clientId}:`, error);
                        this.handleDisconnection(clientId);
                    }
                }
            });
        }, 30000);
    }
    startCleanup() {
        this.cleanupInterval = setInterval(() => {
            const now = new Date();
            const timeout = 5 * 60 * 1000;
            this.clients.forEach((client, clientId) => {
                if (now.getTime() - client.lastHeartbeat.getTime() > timeout) {
                    console.log(`🧹 Cleaning up stale AI CRM client ${clientId}`);
                    this.handleDisconnection(clientId);
                }
            });
        }, 60000);
    }
    startMetricsCollection() {
        this.metricsInterval = setInterval(async () => {
            try {
                const metrics = {
                    totalConnections: this.clients.size,
                    activeConnections: Array.from(this.clients.values()).filter(c => c.ws.readyState === ws_1.WebSocket.OPEN).length,
                    totalSubscriptions: this.subscriptions.size,
                    timestamp: new Date()
                };
                await this.redis.setex('ai-crm:websocket:metrics', 60, JSON.stringify(metrics));
            }
            catch (error) {
                console.error('Failed to collect metrics:', error);
            }
        }, 30000);
    }
    async publishCallUpdate(data) {
        await this.redis.publish('ai-crm:call:events', JSON.stringify(data));
    }
    async publishLeadUpdate(data) {
        await this.redis.publish('ai-crm:lead:events', JSON.stringify(data));
    }
    async publishCampaignMetrics(data) {
        await this.redis.publish('ai-crm:campaign:events', JSON.stringify(data));
    }
    async publishComplianceAlert(data) {
        await this.redis.publish('ai-crm:compliance:alerts', JSON.stringify(data));
    }
    async publishExportUpdate(data) {
        await this.redis.publish('ai-crm:export:events', JSON.stringify(data));
    }
    async publishAnalyticsUpdate(data) {
        await this.redis.publish('ai-crm:analytics:updates', JSON.stringify(data));
    }
    getConnectionStats() {
        const connectionsByAccount = {};
        const subscriptionsByType = {};
        this.clients.forEach(client => {
            connectionsByAccount[client.accountId] = (connectionsByAccount[client.accountId] || 0) + 1;
            client.subscriptions.forEach(subscription => {
                const type = subscription.split(':')[0];
                subscriptionsByType[type] = (subscriptionsByType[type] || 0) + 1;
            });
        });
        return {
            totalConnections: this.clients.size,
            activeConnections: Array.from(this.clients.values()).filter(c => c.ws.readyState === ws_1.WebSocket.OPEN).length,
            totalSubscriptions: this.subscriptions.size,
            connectionsByAccount,
            subscriptionsByType
        };
    }
    async close() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
        }
        this.clients.forEach(client => {
            if (client.ws.readyState === ws_1.WebSocket.OPEN) {
                client.ws.close();
            }
        });
        await this.redis.quit();
        this.wss.close();
        console.log('🛑 AI CRM Real-time WebSocket server closed');
    }
}
exports.AiCrmRealTimeManager = AiCrmRealTimeManager;
