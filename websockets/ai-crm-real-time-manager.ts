import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { Pool } from 'pg';
import { EventEmitter } from 'events';
import * as jwt from 'jsonwebtoken';
import { URL } from 'url';
import Redis from 'ioredis';

interface WebSocketClient {
  id: string;
  ws: WebSocket;
  userId: string;
  accountId: string;
  campaignId?: string;
  subscriptions: Set<string>;
  lastHeartbeat: Date;
  authenticated: boolean;
  metadata: Record<string, any>;
}

interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
  clientId?: string;
}

interface Subscription {
  type: 'campaign' | 'lead' | 'call' | 'analytics' | 'compliance' | 'export';
  resourceId: string;
  filters?: Record<string, any>;
}

interface BroadcastData {
  type: string;
  data: any;
  targetClients?: string[];
  targetCampaigns?: string[];
  targetAccounts?: string[];
  excludeClients?: string[];
}

interface CallUpdate {
  callId: string;
  leadId: string;
  campaignId: string;
  status: string;
  duration?: number;
  cost?: number;
  qualification_score?: number;
  transcript?: string;
  recording_url?: string;
  timestamp: Date;
}

interface LeadUpdate {
  leadId: string;
  campaignId: string;
  status: string;
  qualification_score?: number;
  interest_level?: number;
  next_steps?: string;
  timestamp: Date;
}

interface CampaignMetrics {
  campaignId: string;
  total_leads: number;
  active_calls: number;
  qualified_leads: number;
  total_cost: number;
  connection_rate: number;
  qualification_rate: number;
  calls_today: number;
  timestamp: Date;
}

interface ComplianceAlert {
  id: string;
  type: 'dnc_violation' | 'time_violation' | 'frequency_violation' | 'consent_issue';
  severity: 'low' | 'medium' | 'high' | 'critical';
  phone_number: string;
  campaign_id: string;
  reason: string;
  timestamp: Date;
}

export class AiCrmRealTimeManager extends EventEmitter {
  private pool: Pool;
  private wss: WebSocketServer;
  private redis: Redis;
  private clients: Map<string, WebSocketClient>;
  private subscriptions: Map<string, Set<string>>; // resourceId -> clientIds
  private heartbeatInterval: NodeJS.Timeout;
  private cleanupInterval: NodeJS.Timeout;
  private metricsInterval: NodeJS.Timeout;
  private jwtSecret: string;

  constructor(server: Server, pool: Pool, redisUrl?: string) {
    super();
    this.pool = pool;
    this.clients = new Map();
    this.subscriptions = new Map();
    this.jwtSecret = process.env.JWT_SECRET || 'default-secret';

    // Initialize Redis
    this.redis = new Redis(redisUrl || 'redis://localhost:6379');
    
    // Create WebSocket server
    this.wss = new WebSocketServer({
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

  /**
   * Setup WebSocket server
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws, request) => {
      this.handleConnection(ws, request);
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });

    console.log('🚀 AI CRM Real-time WebSocket server started on /ws/ai-crm');
  }

  /**
   * Setup Redis subscriptions for real-time events
   */
  private setupRedisSubscriptions(): void {
    // Subscribe to call events
    this.redis.subscribe('ai-crm:call:events', (err, count) => {
      if (err) {
        console.error('Redis subscription error:', err);
      } else {
        console.log(`📡 Subscribed to ${count} Redis channels`);
      }
    });

    // Handle Redis messages
    this.redis.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        this.handleRedisMessage(channel, data);
      } catch (error) {
        console.error('Redis message parsing error:', error);
      }
    });

    // Subscribe to additional channels
    this.redis.subscribe(
      'ai-crm:lead:events',
      'ai-crm:campaign:events',
      'ai-crm:compliance:alerts',
      'ai-crm:export:events',
      'ai-crm:analytics:updates'
    );
  }

  /**
   * Handle Redis messages
   */
  private handleRedisMessage(channel: string, data: any): void {
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

  /**
   * Verify client connection
   */
  private verifyClient(info: any): boolean {
    try {
      const url = new URL(info.req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      
      if (!token) {
        return false;
      }

      // Verify JWT token
      jwt.verify(token, this.jwtSecret);
      return true;
      
    } catch (error) {
      console.error('WebSocket client verification failed:', error);
      return false;
    }
  }

  /**
   * Handle new WebSocket connection
   */
  private async handleConnection(ws: WebSocket, request: any): Promise<void> {
    const clientId = this.generateClientId();
    
    try {
      // Parse token from URL
      const url = new URL(request.url, 'http://localhost');
      const token = url.searchParams.get('token');
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      
      // Create client
      const client: WebSocketClient = {
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
      
      // Setup message handler
      ws.on('message', (data) => {
        this.handleMessage(clientId, data);
      });

      // Setup close handler
      ws.on('close', () => {
        this.handleDisconnection(clientId);
      });

      // Setup error handler
      ws.on('error', (error) => {
        console.error(`WebSocket client ${clientId} error:`, error);
        this.handleDisconnection(clientId);
      });

      // Send welcome message
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
      
      // Auto-subscribe to account updates
      if (client.accountId) {
        await this.handleSubscribe(clientId, {
          type: 'campaign',
          resourceId: 'account:' + client.accountId
        });
      }

      // Auto-subscribe to specific campaign if provided
      if (client.campaignId) {
        await this.handleSubscribe(clientId, {
          type: 'campaign',
          resourceId: client.campaignId
        });
      }

      // Emit connection event
      this.emit('client_connected', {
        clientId,
        userId: decoded.userId || decoded.sub,
        accountId: decoded.accountId,
        campaignId: client.campaignId
      });

    } catch (error) {
      console.error('WebSocket connection error:', error);
      ws.close(1000, 'Authentication failed');
    }
  }

  /**
   * Handle incoming message from client
   */
  private async handleMessage(clientId: string, data: Buffer): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const message = JSON.parse(data.toString()) as WebSocketMessage;
      
      // Update heartbeat
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
      
    } catch (error) {
      console.error(`Message handling error for client ${clientId}:`, error);
      this.sendToClient(clientId, {
        type: 'error',
        data: { message: 'Invalid message format', error: error.message }
      });
    }
  }

  /**
   * Handle call events
   */
  private handleCallEvent(data: CallUpdate): void {
    const { callId, leadId, campaignId, status } = data;
    
    // Broadcast to campaign subscribers
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

    // Broadcast to call-specific subscribers
    this.broadcastToSubscribers(`call:${callId}`, {
      type: 'call_detail_update',
      data: {
        ...data,
        transcript: data.transcript,
        recording_url: data.recording_url
      }
    });
  }

  /**
   * Handle lead events
   */
  private handleLeadEvent(data: LeadUpdate): void {
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

    // If lead is qualified, send special notification
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

  /**
   * Handle campaign events
   */
  private handleCampaignEvent(data: CampaignMetrics): void {
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

  /**
   * Handle compliance alerts
   */
  private handleComplianceAlert(data: ComplianceAlert): void {
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

    // Send to all admins/supervisors for critical alerts
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

  /**
   * Handle export events
   */
  private handleExportEvent(data: any): void {
    const { exportId, campaignId, status, userId } = data;
    
    // Send to specific user who requested export
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

  /**
   * Handle analytics updates
   */
  private handleAnalyticsUpdate(data: any): void {
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
    } else {
      this.broadcastToAccount(accountId, {
        type: 'analytics_update',
        data: {
          analytics,
          timestamp: new Date()
        }
      });
    }
  }

  /**
   * Handle subscription request
   */
  private async handleSubscribe(clientId: string, subscription: Subscription): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const resourceId = `${subscription.type}:${subscription.resourceId}`;
      
      // Check authorization
      const canSubscribe = await this.checkSubscriptionAuthorization(client, subscription);
      if (!canSubscribe) {
        this.sendToClient(clientId, {
          type: 'subscription_denied',
          data: { resourceId, reason: 'Unauthorized' }
        });
        return;
      }

      // Add to subscriptions
      client.subscriptions.add(resourceId);
      
      if (!this.subscriptions.has(resourceId)) {
        this.subscriptions.set(resourceId, new Set());
      }
      this.subscriptions.get(resourceId)!.add(clientId);

      // Send confirmation
      this.sendToClient(clientId, {
        type: 'subscribed',
        data: { resourceId, subscription }
      });

      // Send initial data
      await this.sendInitialData(clientId, subscription);

      console.log(`📡 Client ${clientId} subscribed to ${resourceId}`);

    } catch (error) {
      console.error(`Subscription error for client ${clientId}:`, error);
      this.sendToClient(clientId, {
        type: 'subscription_error',
        data: { error: error.message }
      });
    }
  }

  /**
   * Handle unsubscription request
   */
  private async handleUnsubscribe(clientId: string, data: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    const resourceId = `${data.type}:${data.resourceId}`;
    
    // Remove from subscriptions
    client.subscriptions.delete(resourceId);
    
    const subscribers = this.subscriptions.get(resourceId);
    if (subscribers) {
      subscribers.delete(clientId);
      if (subscribers.size === 0) {
        this.subscriptions.delete(resourceId);
      }
    }

    // Send confirmation
    this.sendToClient(clientId, {
      type: 'unsubscribed',
      data: { resourceId }
    });
  }

  /**
   * Handle get campaign metrics request
   */
  private async handleGetCampaignMetrics(clientId: string, data: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const { campaignId } = data;
      const metrics = await this.getCampaignMetrics(campaignId);
      
      this.sendToClient(clientId, {
        type: 'campaign_metrics',
        data: { campaignId, metrics }
      });
    } catch (error) {
      this.sendToClient(clientId, {
        type: 'error',
        data: { message: 'Failed to get campaign metrics', error: error.message }
      });
    }
  }

  /**
   * Handle get active calls request
   */
  private async handleGetActiveCalls(clientId: string, data: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const { campaignId } = data;
      const activeCalls = await this.getActiveCalls(campaignId);
      
      this.sendToClient(clientId, {
        type: 'active_calls',
        data: { campaignId, activeCalls }
      });
    } catch (error) {
      this.sendToClient(clientId, {
        type: 'error',
        data: { message: 'Failed to get active calls', error: error.message }
      });
    }
  }

  /**
   * Handle get qualified leads request
   */
  private async handleGetQualifiedLeads(clientId: string, data: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const { campaignId, limit = 10 } = data;
      const qualifiedLeads = await this.getQualifiedLeads(campaignId, limit);
      
      this.sendToClient(clientId, {
        type: 'qualified_leads',
        data: { campaignId, qualifiedLeads }
      });
    } catch (error) {
      this.sendToClient(clientId, {
        type: 'error',
        data: { message: 'Failed to get qualified leads', error: error.message }
      });
    }
  }

  /**
   * Handle trigger export request
   */
  private async handleTriggerExport(clientId: string, data: any): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      // Publish export request to Redis
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
    } catch (error) {
      this.sendToClient(clientId, {
        type: 'error',
        data: { message: 'Failed to trigger export', error: error.message }
      });
    }
  }

  /**
   * Broadcast helpers
   */
  private broadcastToCampaign(campaignId: string, message: any): void {
    const resourceId = `campaign:${campaignId}`;
    this.broadcastToSubscribers(resourceId, message);
  }

  private broadcastToAccount(accountId: string, message: any): void {
    const resourceId = `account:${accountId}`;
    this.broadcastToSubscribers(resourceId, message);
  }

  private broadcastToSubscribers(resourceId: string, message: any): void {
    const subscribers = this.subscriptions.get(resourceId);
    if (!subscribers) return;

    const fullMessage = {
      ...message,
      timestamp: new Date().toISOString()
    };

    subscribers.forEach(clientId => {
      this.sendToClient(clientId, fullMessage);
    });
  }

  private sendToUser(userId: string, message: any): void {
    this.clients.forEach((client, clientId) => {
      if (client.userId === userId) {
        this.sendToClient(clientId, message);
      }
    });
  }

  private sendToClient(clientId: string, message: Partial<WebSocketMessage>): void {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const fullMessage: WebSocketMessage = {
      type: message.type || 'message',
      data: message.data || {},
      timestamp: new Date().toISOString(),
      clientId
    };

    try {
      client.ws.send(JSON.stringify(fullMessage));
    } catch (error) {
      console.error(`Failed to send message to client ${clientId}:`, error);
    }
  }

  /**
   * Database operations
   */
  private async getCampaignMetrics(campaignId: string): Promise<any> {
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        'SELECT * FROM get_campaign_metrics($1)',
        [campaignId]
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  private async getActiveCalls(campaignId: string): Promise<any[]> {
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
    } finally {
      client.release();
    }
  }

  private async getQualifiedLeads(campaignId: string, limit: number): Promise<any[]> {
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
    } finally {
      client.release();
    }
  }

  private async checkSubscriptionAuthorization(
    client: WebSocketClient,
    subscription: Subscription
  ): Promise<boolean> {
    // For now, allow all subscriptions for authenticated users
    // In production, implement proper authorization logic
    return client.authenticated;
  }

  private async sendInitialData(clientId: string, subscription: Subscription): Promise<void> {
    // Send relevant initial data based on subscription type
    switch (subscription.type) {
      case 'campaign':
        if (subscription.resourceId.startsWith('account:')) {
          // Send account-wide initial data
        } else {
          // Send campaign-specific initial data
          await this.handleGetCampaignMetrics(clientId, { campaignId: subscription.resourceId });
        }
        break;
    }
  }

  /**
   * Utility methods
   */
  private generateClientId(): string {
    return `ai-crm-client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private handleDisconnection(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from subscriptions
    client.subscriptions.forEach(resourceId => {
      const subscribers = this.subscriptions.get(resourceId);
      if (subscribers) {
        subscribers.delete(clientId);
        if (subscribers.size === 0) {
          this.subscriptions.delete(resourceId);
        }
      }
    });

    // Remove client
    this.clients.delete(clientId);
    
    console.log(`📡 AI CRM client ${clientId} disconnected`);
    
    // Emit disconnection event
    this.emit('client_disconnected', {
      clientId,
      userId: client.userId,
      accountId: client.accountId
    });
  }

  /**
   * Lifecycle methods
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((client, clientId) => {
        if (client.ws.readyState === WebSocket.OPEN) {
          try {
            client.ws.ping();
          } catch (error) {
            console.error(`Heartbeat failed for client ${clientId}:`, error);
            this.handleDisconnection(clientId);
          }
        }
      });
    }, 30000);
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = new Date();
      const timeout = 5 * 60 * 1000; // 5 minutes

      this.clients.forEach((client, clientId) => {
        if (now.getTime() - client.lastHeartbeat.getTime() > timeout) {
          console.log(`🧹 Cleaning up stale AI CRM client ${clientId}`);
          this.handleDisconnection(clientId);
        }
      });
    }, 60000);
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(async () => {
      try {
        const metrics = {
          totalConnections: this.clients.size,
          activeConnections: Array.from(this.clients.values()).filter(c => c.ws.readyState === WebSocket.OPEN).length,
          totalSubscriptions: this.subscriptions.size,
          timestamp: new Date()
        };

        await this.redis.setex('ai-crm:websocket:metrics', 60, JSON.stringify(metrics));
      } catch (error) {
        console.error('Failed to collect metrics:', error);
      }
    }, 30000);
  }

  /**
   * Public API methods
   */
  async publishCallUpdate(data: CallUpdate): Promise<void> {
    await this.redis.publish('ai-crm:call:events', JSON.stringify(data));
  }

  async publishLeadUpdate(data: LeadUpdate): Promise<void> {
    await this.redis.publish('ai-crm:lead:events', JSON.stringify(data));
  }

  async publishCampaignMetrics(data: CampaignMetrics): Promise<void> {
    await this.redis.publish('ai-crm:campaign:events', JSON.stringify(data));
  }

  async publishComplianceAlert(data: ComplianceAlert): Promise<void> {
    await this.redis.publish('ai-crm:compliance:alerts', JSON.stringify(data));
  }

  async publishExportUpdate(data: any): Promise<void> {
    await this.redis.publish('ai-crm:export:events', JSON.stringify(data));
  }

  async publishAnalyticsUpdate(data: any): Promise<void> {
    await this.redis.publish('ai-crm:analytics:updates', JSON.stringify(data));
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    totalConnections: number;
    activeConnections: number;
    totalSubscriptions: number;
    connectionsByAccount: Record<string, number>;
    subscriptionsByType: Record<string, number>;
  } {
    const connectionsByAccount: Record<string, number> = {};
    const subscriptionsByType: Record<string, number> = {};

    this.clients.forEach(client => {
      connectionsByAccount[client.accountId] = (connectionsByAccount[client.accountId] || 0) + 1;
      
      client.subscriptions.forEach(subscription => {
        const type = subscription.split(':')[0];
        subscriptionsByType[type] = (subscriptionsByType[type] || 0) + 1;
      });
    });

    return {
      totalConnections: this.clients.size,
      activeConnections: Array.from(this.clients.values()).filter(c => c.ws.readyState === WebSocket.OPEN).length,
      totalSubscriptions: this.subscriptions.size,
      connectionsByAccount,
      subscriptionsByType
    };
  }

  /**
   * Close the real-time manager
   */
  async close(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Close all client connections
    this.clients.forEach(client => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.close();
      }
    });

    // Close Redis connection
    await this.redis.quit();

    // Close WebSocket server
    this.wss.close();
    
    console.log('🛑 AI CRM Real-time WebSocket server closed');
  }
}