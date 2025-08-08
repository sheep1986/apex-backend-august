"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealTimeManager = void 0;
const socket_io_1 = require("socket.io");
const redis_adapter_1 = require("@socket.io/redis-adapter");
const redis_1 = require("redis");
const supabase_js_1 = require("@supabase/supabase-js");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
class RealTimeManager {
    constructor(httpServer, redisUrl, supabaseUrl, supabaseKey, jwtSecret) {
        this.authenticatedSockets = new Map();
        this.io = new socket_io_1.Server(httpServer, {
            cors: {
                origin: process.env.FRONTEND_URL || "http://localhost:3000",
                methods: ["GET", "POST"],
                credentials: true
            },
            transports: ['websocket', 'polling']
        });
        this.redisClient = (0, redis_1.createClient)({ url: redisUrl });
        this.redisSubscriber = this.redisClient.duplicate();
        this.io.adapter((0, redis_adapter_1.createAdapter)(this.redisClient, this.redisSubscriber));
        this.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
        this.setupAuthentication(jwtSecret);
        this.setupEventHandlers();
        this.setupRedisSubscriptions();
        this.startHeartbeat();
    }
    setupAuthentication(jwtSecret) {
        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
                if (!token) {
                    return next(new Error('Authentication token required'));
                }
                const decoded = jsonwebtoken_1.default.verify(token, jwtSecret);
                const { data: user, error } = await this.supabase
                    .from('users')
                    .select('*, account:accounts(*)')
                    .eq('clerk_user_id', decoded.sub)
                    .single();
                if (error || !user) {
                    return next(new Error('Invalid user'));
                }
                const authPayload = {
                    userId: user.id,
                    accountId: user.account_id,
                    role: user.role,
                    permissions: user.permissions || []
                };
                this.authenticatedSockets.set(socket.id, authPayload);
                socket.data = authPayload;
                next();
            }
            catch (error) {
                console.error('Socket authentication error:', error);
                next(new Error('Authentication failed'));
            }
        });
    }
    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            const auth = this.authenticatedSockets.get(socket.id);
            if (!auth)
                return;
            console.log(`User connected: ${auth.userId} (Account: ${auth.accountId})`);
            socket.join(`account:${auth.accountId}`);
            socket.join(`role:${auth.role}`);
            socket.join(`user:${auth.userId}`);
            socket.on('subscribe:call', (callId) => {
                if (this.canAccessCall(auth, callId)) {
                    socket.join(`call:${callId}`);
                    console.log(`User ${auth.userId} subscribed to call ${callId}`);
                }
            });
            socket.on('subscribe:campaign', (campaignId) => {
                if (this.canAccessCampaign(auth, campaignId)) {
                    socket.join(`campaign:${campaignId}`);
                    console.log(`User ${auth.userId} subscribed to campaign ${campaignId}`);
                }
            });
            socket.on('agent:status-update', (status) => {
                this.handleAgentStatusUpdate(auth.userId, status);
            });
            socket.on('call:intervention', (data) => {
                this.handleCallIntervention(auth, data);
            });
            socket.on('alert:acknowledge', (alertId) => {
                this.handleAlertAcknowledgment(auth, alertId);
            });
            socket.on('disconnect', () => {
                console.log(`User disconnected: ${auth.userId}`);
                this.authenticatedSockets.delete(socket.id);
                this.handleAgentStatusUpdate(auth.userId, 'offline');
            });
            this.sendSystemStatus(socket, auth);
        });
    }
    setupRedisSubscriptions() {
        this.redisSubscriber.subscribe('call:events', (message) => {
            try {
                const event = JSON.parse(message);
                this.handleCallEvent(event);
            }
            catch (error) {
                console.error('Error processing call event:', error);
            }
        });
        this.redisSubscriber.subscribe('system:alerts', (message) => {
            try {
                const alert = JSON.parse(message);
                this.broadcastSystemAlert(alert);
            }
            catch (error) {
                console.error('Error processing system alert:', error);
            }
        });
        this.redisSubscriber.subscribe('campaign:updates', (message) => {
            try {
                const update = JSON.parse(message);
                this.handleCampaignUpdate(update);
            }
            catch (error) {
                console.error('Error processing campaign update:', error);
            }
        });
    }
    async broadcastCallUpdate(accountId, update) {
        try {
            this.io.to(`account:${accountId}`).emit('call:update', {
                type: 'CALL_UPDATE',
                payload: update,
                timestamp: new Date().toISOString()
            });
            this.io.to(`call:${update.sessionId}`).emit('call:detailed-update', {
                type: 'CALL_DETAILED_UPDATE',
                payload: update,
                timestamp: new Date().toISOString()
            });
            await this.redisClient.setex(`call:${update.sessionId}:latest`, 3600, JSON.stringify(update));
        }
        catch (error) {
            console.error('Error broadcasting call update:', error);
        }
    }
    async streamTranscript(callId, transcript) {
        try {
            this.io.to(`call:${callId}`).emit('call:transcript', {
                type: 'TRANSCRIPT_SEGMENT',
                payload: transcript,
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            console.error('Error streaming transcript:', error);
        }
    }
    async broadcastSystemAlert(alert) {
        try {
            const targetRooms = this.determineAlertTargets(alert);
            targetRooms.forEach(room => {
                this.io.to(room).emit('system:alert', {
                    type: 'SYSTEM_ALERT',
                    payload: alert,
                    timestamp: new Date().toISOString()
                });
            });
            await this.supabase
                .from('system_alerts')
                .insert([{
                    id: alert.id,
                    type: alert.type,
                    severity: alert.severity,
                    title: alert.title,
                    message: alert.message,
                    source: alert.source,
                    metadata: alert.metadata,
                    acknowledged: false,
                    created_at: alert.timestamp
                }]);
        }
        catch (error) {
            console.error('Error broadcasting system alert:', error);
        }
    }
    async broadcastAgentUpdate(accountId, update) {
        try {
            this.io.to(`account:${accountId}`).emit('agent:update', {
                type: 'AGENT_UPDATE',
                payload: update,
                timestamp: new Date().toISOString()
            });
            await this.supabase
                .from('agent_sessions')
                .upsert([{
                    user_id: update.agentId,
                    status: update.status,
                    current_call_id: update.currentCallId,
                    performance_metrics: update.performanceMetrics,
                    updated_at: new Date()
                }]);
        }
        catch (error) {
            console.error('Error broadcasting agent update:', error);
        }
    }
    async broadcastCampaignMetrics(accountId, campaignId, metrics) {
        try {
            this.io.to(`account:${accountId}`).emit('campaign:metrics', {
                type: 'CAMPAIGN_METRICS',
                payload: {
                    campaignId,
                    metrics,
                    timestamp: new Date()
                },
                timestamp: new Date().toISOString()
            });
            this.io.to(`campaign:${campaignId}`).emit('campaign:detailed-metrics', {
                type: 'CAMPAIGN_DETAILED_METRICS',
                payload: metrics,
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            console.error('Error broadcasting campaign metrics:', error);
        }
    }
    async broadcastAnalyticsUpdate(accountId, analytics) {
        try {
            this.io.to(`account:${accountId}`).emit('analytics:update', {
                type: 'ANALYTICS_UPDATE',
                payload: analytics,
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            console.error('Error broadcasting analytics update:', error);
        }
    }
    handleCallEvent(event) {
        const { accountId, sessionId, eventType, data } = event;
        switch (eventType) {
            case 'call_started':
                this.broadcastCallUpdate(accountId, {
                    sessionId,
                    status: 'active',
                    timestamp: new Date(),
                    ...data
                });
                break;
            case 'call_ended':
                this.broadcastCallUpdate(accountId, {
                    sessionId,
                    status: 'completed',
                    duration: data.duration,
                    timestamp: new Date(),
                    ...data
                });
                break;
            case 'sentiment_changed':
                this.io.to(`call:${sessionId}`).emit('call:sentiment-update', {
                    type: 'SENTIMENT_UPDATE',
                    payload: { sentiment: data.sentiment, risk: data.risk },
                    timestamp: new Date().toISOString()
                });
                break;
            case 'transcript_segment':
                this.streamTranscript(sessionId, data);
                break;
        }
    }
    async handleAgentStatusUpdate(userId, status) {
        try {
            const auth = Array.from(this.authenticatedSockets.values())
                .find(a => a.userId === userId);
            if (!auth)
                return;
            const update = {
                agentId: userId,
                status: status,
                timestamp: new Date()
            };
            await this.broadcastAgentUpdate(auth.accountId, update);
        }
        catch (error) {
            console.error('Error handling agent status update:', error);
        }
    }
    async handleCallIntervention(auth, data) {
        try {
            if (!this.canInterveneCalls(auth)) {
                return;
            }
            await this.redisClient.publish('call:interventions', JSON.stringify({
                callId: data.callId,
                action: data.action,
                requestedBy: auth.userId,
                params: data.params,
                timestamp: new Date()
            }));
            await this.supabase
                .from('call_events')
                .insert([{
                    call_session_id: data.callId,
                    event_type: 'intervention_requested',
                    event_data: {
                        action: data.action,
                        requestedBy: auth.userId,
                        params: data.params
                    }
                }]);
        }
        catch (error) {
            console.error('Error handling call intervention:', error);
        }
    }
    async handleAlertAcknowledgment(auth, alertId) {
        try {
            await this.supabase
                .from('system_alerts')
                .update({
                acknowledged: true,
                acknowledged_by: auth.userId,
                acknowledged_at: new Date()
            })
                .eq('id', alertId);
            this.io.to(`account:${auth.accountId}`).emit('alert:acknowledged', {
                alertId,
                acknowledgedBy: auth.userId,
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            console.error('Error handling alert acknowledgment:', error);
        }
    }
    async sendSystemStatus(socket, auth) {
        try {
            const { data: activeCalls } = await this.supabase
                .from('call_sessions')
                .select('*')
                .eq('account_id', auth.accountId)
                .in('status', ['active', 'ringing', 'dialing']);
            const { data: alerts } = await this.supabase
                .from('system_alerts')
                .select('*')
                .eq('account_id', auth.accountId)
                .eq('acknowledged', false)
                .order('created_at', { ascending: false })
                .limit(10);
            const { data: agents } = await this.supabase
                .from('agent_sessions')
                .select('*')
                .eq('account_id', auth.accountId)
                .neq('status', 'offline');
            socket.emit('system:status', {
                activeCalls: activeCalls || [],
                alerts: alerts || [],
                agents: agents || [],
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            console.error('Error sending system status:', error);
        }
    }
    canAccessCall(auth, callId) {
        return ['admin', 'supervisor', 'agent'].includes(auth.role);
    }
    canAccessCampaign(auth, campaignId) {
        return ['admin', 'supervisor'].includes(auth.role);
    }
    canInterveneCalls(auth) {
        return ['admin', 'supervisor'].includes(auth.role);
    }
    determineAlertTargets(alert) {
        const targets = [];
        switch (alert.severity) {
            case 'critical':
                targets.push('role:admin', 'role:supervisor');
                break;
            case 'high':
                targets.push('role:admin', 'role:supervisor');
                break;
            case 'medium':
                targets.push('role:supervisor');
                break;
            case 'low':
                targets.push('role:admin');
                break;
        }
        return targets;
    }
    handleCampaignUpdate(update) {
    }
    startHeartbeat() {
        setInterval(async () => {
            try {
                const connectedSockets = await this.io.fetchSockets();
                const connectedIds = new Set(connectedSockets.map(s => s.id));
                for (const [socketId] of this.authenticatedSockets) {
                    if (!connectedIds.has(socketId)) {
                        this.authenticatedSockets.delete(socketId);
                    }
                }
                await this.updateSystemMetrics();
            }
            catch (error) {
                console.error('Error in heartbeat:', error);
            }
        }, 30000);
    }
    async updateSystemMetrics() {
        try {
            const metrics = {
                connectedSockets: this.io.engine.clientsCount,
                authenticatedUsers: this.authenticatedSockets.size,
                totalRooms: this.io.sockets.adapter.rooms.size,
                timestamp: new Date()
            };
            await this.redisClient.setex('realtime:metrics', 60, JSON.stringify(metrics));
        }
        catch (error) {
            console.error('Error updating system metrics:', error);
        }
    }
    async shutdown() {
        console.log('Shutting down real-time manager...');
        try {
            await this.redisClient.quit();
            await this.redisSubscriber.quit();
            this.io.close();
            console.log('Real-time manager shutdown complete');
        }
        catch (error) {
            console.error('Error during shutdown:', error);
        }
    }
}
exports.RealTimeManager = RealTimeManager;
exports.default = RealTimeManager;
