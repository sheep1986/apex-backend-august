import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

interface SocketAuthPayload {
  userId: string;
  accountId: string;
  role: string;
  permissions: string[];
}

interface CallUpdate {
  sessionId: string;
  status: string;
  duration?: number;
  sentiment?: string;
  risk?: string;
  transcript?: string;
  aiInsights?: any;
  timestamp: Date;
}

interface SystemAlert {
  id: string;
  type: 'warning' | 'error' | 'info' | 'success';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  source: string;
  timestamp: Date;
  acknowledged?: boolean;
  actionRequired?: boolean;
  metadata?: any;
}

interface AgentUpdate {
  agentId: string;
  status: 'available' | 'busy' | 'on_call' | 'away' | 'offline';
  currentCallId?: string;
  performanceMetrics?: any;
  timestamp: Date;
}

interface CampaignUpdate {
  campaignId: string;
  status: string;
  metrics: any;
  timestamp: Date;
}

export class RealTimeManager {
  private io: SocketIOServer;
  private redisClient: any;
  private redisSubscriber: any;
  private supabase: any;
  private authenticatedSockets: Map<string, SocketAuthPayload> = new Map();

  constructor(
    httpServer: HTTPServer,
    redisUrl: string,
    supabaseUrl: string,
    supabaseKey: string,
    jwtSecret: string
  ) {
    // Initialize Socket.IO with Redis adapter for horizontal scaling
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    // Initialize Redis clients
    this.redisClient = createClient({ url: redisUrl });
    this.redisSubscriber = this.redisClient.duplicate();

    // Setup Redis adapter for Socket.IO clustering
    this.io.adapter(createAdapter(this.redisClient, this.redisSubscriber));

    // Initialize Supabase client
    this.supabase = createSupabaseClient(supabaseUrl, supabaseKey);

    // Setup authentication middleware
    this.setupAuthentication(jwtSecret);

    // Setup event handlers
    this.setupEventHandlers();

    // Setup Redis subscriptions for cross-service communication
    this.setupRedisSubscriptions();

    // Start heartbeat monitoring
    this.startHeartbeat();
  }

  /**
   * Authentication middleware for WebSocket connections
   */
  private setupAuthentication(jwtSecret: string): void {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, jwtSecret) as any;
        
        // Get user details from database
        const { data: user, error } = await this.supabase
          .from('users')
          .select('*, account:accounts(*)')
          .eq('clerk_user_id', decoded.sub)
          .single();

        if (error || !user) {
          return next(new Error('Invalid user'));
        }

        // Store auth payload
        const authPayload: SocketAuthPayload = {
          userId: user.id,
          accountId: user.account_id,
          role: user.role,
          permissions: user.permissions || []
        };

        this.authenticatedSockets.set(socket.id, authPayload);
        socket.data = authPayload;

        next();
      } catch (error) {
        console.error('Socket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Setup main event handlers for socket connections
   */
  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      const auth = this.authenticatedSockets.get(socket.id);
      if (!auth) return;

      console.log(`User connected: ${auth.userId} (Account: ${auth.accountId})`);

      // Join account-specific room
      socket.join(`account:${auth.accountId}`);
      
      // Join role-specific room
      socket.join(`role:${auth.role}`);

      // Join user-specific room
      socket.join(`user:${auth.userId}`);

      // Handle subscription to specific call sessions
      socket.on('subscribe:call', (callId: string) => {
        if (this.canAccessCall(auth, callId)) {
          socket.join(`call:${callId}`);
          console.log(`User ${auth.userId} subscribed to call ${callId}`);
        }
      });

      // Handle subscription to campaigns
      socket.on('subscribe:campaign', (campaignId: string) => {
        if (this.canAccessCampaign(auth, campaignId)) {
          socket.join(`campaign:${campaignId}`);
          console.log(`User ${auth.userId} subscribed to campaign ${campaignId}`);
        }
      });

      // Handle agent status updates
      socket.on('agent:status-update', (status: string) => {
        this.handleAgentStatusUpdate(auth.userId, status);
      });

      // Handle call intervention requests
      socket.on('call:intervention', (data: { callId: string; action: string; params?: any }) => {
        this.handleCallIntervention(auth, data);
      });

      // Handle alert acknowledgment
      socket.on('alert:acknowledge', (alertId: string) => {
        this.handleAlertAcknowledgment(auth, alertId);
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`User disconnected: ${auth.userId}`);
        this.authenticatedSockets.delete(socket.id);
        this.handleAgentStatusUpdate(auth.userId, 'offline');
      });

      // Send current system status on connection
      this.sendSystemStatus(socket, auth);
    });
  }

  /**
   * Setup Redis subscriptions for cross-service events
   */
  private setupRedisSubscriptions(): void {
    // Subscribe to call events from Twilio service
    this.redisSubscriber.subscribe('call:events', (message: string) => {
      try {
        const event = JSON.parse(message);
        this.handleCallEvent(event);
      } catch (error) {
        console.error('Error processing call event:', error);
      }
    });

    // Subscribe to system alerts
    this.redisSubscriber.subscribe('system:alerts', (message: string) => {
      try {
        const alert = JSON.parse(message);
        this.broadcastSystemAlert(alert);
      } catch (error) {
        console.error('Error processing system alert:', error);
      }
    });

    // Subscribe to campaign updates
    this.redisSubscriber.subscribe('campaign:updates', (message: string) => {
      try {
        const update = JSON.parse(message);
        this.handleCampaignUpdate(update);
      } catch (error) {
        console.error('Error processing campaign update:', error);
      }
    });
  }

  /**
   * Broadcast call updates to relevant users
   */
  async broadcastCallUpdate(accountId: string, update: CallUpdate): Promise<void> {
    try {
      // Broadcast to account room
      this.io.to(`account:${accountId}`).emit('call:update', {
        type: 'CALL_UPDATE',
        payload: update,
        timestamp: new Date().toISOString()
      });

      // Broadcast to specific call room if exists
      this.io.to(`call:${update.sessionId}`).emit('call:detailed-update', {
        type: 'CALL_DETAILED_UPDATE',
        payload: update,
        timestamp: new Date().toISOString()
      });

      // Store in Redis for persistence
      await this.redisClient.setex(
        `call:${update.sessionId}:latest`, 
        3600, // 1 hour TTL
        JSON.stringify(update)
      );

    } catch (error) {
      console.error('Error broadcasting call update:', error);
    }
  }

  /**
   * Stream live transcript updates
   */
  async streamTranscript(callId: string, transcript: any): Promise<void> {
    try {
      this.io.to(`call:${callId}`).emit('call:transcript', {
        type: 'TRANSCRIPT_SEGMENT',
        payload: transcript,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error streaming transcript:', error);
    }
  }

  /**
   * Broadcast system alerts to appropriate users
   */
  async broadcastSystemAlert(alert: SystemAlert): Promise<void> {
    try {
      // Determine target audience based on alert severity and type
      const targetRooms = this.determineAlertTargets(alert);

      targetRooms.forEach(room => {
        this.io.to(room).emit('system:alert', {
          type: 'SYSTEM_ALERT',
          payload: alert,
          timestamp: new Date().toISOString()
        });
      });

      // Store alert in database
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

    } catch (error) {
      console.error('Error broadcasting system alert:', error);
    }
  }

  /**
   * Broadcast agent status updates
   */
  async broadcastAgentUpdate(accountId: string, update: AgentUpdate): Promise<void> {
    try {
      this.io.to(`account:${accountId}`).emit('agent:update', {
        type: 'AGENT_UPDATE',
        payload: update,
        timestamp: new Date().toISOString()
      });

      // Update agent session in database
      await this.supabase
        .from('agent_sessions')
        .upsert([{
          user_id: update.agentId,
          status: update.status,
          current_call_id: update.currentCallId,
          performance_metrics: update.performanceMetrics,
          updated_at: new Date()
        }]);

    } catch (error) {
      console.error('Error broadcasting agent update:', error);
    }
  }

  /**
   * Broadcast campaign metrics updates
   */
  async broadcastCampaignMetrics(accountId: string, campaignId: string, metrics: any): Promise<void> {
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

    } catch (error) {
      console.error('Error broadcasting campaign metrics:', error);
    }
  }

  /**
   * Send real-time analytics updates
   */
  async broadcastAnalyticsUpdate(accountId: string, analytics: any): Promise<void> {
    try {
      this.io.to(`account:${accountId}`).emit('analytics:update', {
        type: 'ANALYTICS_UPDATE',
        payload: analytics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error broadcasting analytics update:', error);
    }
  }

  /**
   * Handle call events from external services
   */
  private handleCallEvent(event: any): void {
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

  /**
   * Handle agent status updates
   */
  private async handleAgentStatusUpdate(userId: string, status: string): Promise<void> {
    try {
      const auth = Array.from(this.authenticatedSockets.values())
        .find(a => a.userId === userId);
      
      if (!auth) return;

      const update: AgentUpdate = {
        agentId: userId,
        status: status as any,
        timestamp: new Date()
      };

      await this.broadcastAgentUpdate(auth.accountId, update);
    } catch (error) {
      console.error('Error handling agent status update:', error);
    }
  }

  /**
   * Handle call intervention requests
   */
  private async handleCallIntervention(auth: SocketAuthPayload, data: any): Promise<void> {
    try {
      // Verify permissions
      if (!this.canInterveneCalls(auth)) {
        return;
      }

      // Publish intervention request to call service
      await this.redisClient.publish('call:interventions', JSON.stringify({
        callId: data.callId,
        action: data.action,
        requestedBy: auth.userId,
        params: data.params,
        timestamp: new Date()
      }));

      // Log the intervention
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

    } catch (error) {
      console.error('Error handling call intervention:', error);
    }
  }

  /**
   * Handle alert acknowledgment
   */
  private async handleAlertAcknowledgment(auth: SocketAuthPayload, alertId: string): Promise<void> {
    try {
      await this.supabase
        .from('system_alerts')
        .update({ 
          acknowledged: true, 
          acknowledged_by: auth.userId,
          acknowledged_at: new Date()
        })
        .eq('id', alertId);

      // Broadcast acknowledgment to other users
      this.io.to(`account:${auth.accountId}`).emit('alert:acknowledged', {
        alertId,
        acknowledgedBy: auth.userId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error handling alert acknowledgment:', error);
    }
  }

  /**
   * Send current system status to newly connected clients
   */
  private async sendSystemStatus(socket: any, auth: SocketAuthPayload): Promise<void> {
    try {
      // Get current call sessions
      const { data: activeCalls } = await this.supabase
        .from('call_sessions')
        .select('*')
        .eq('account_id', auth.accountId)
        .in('status', ['active', 'ringing', 'dialing']);

      // Get recent alerts
      const { data: alerts } = await this.supabase
        .from('system_alerts')
        .select('*')
        .eq('account_id', auth.accountId)
        .eq('acknowledged', false)
        .order('created_at', { ascending: false })
        .limit(10);

      // Get agent statuses
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

    } catch (error) {
      console.error('Error sending system status:', error);
    }
  }

  /**
   * Permission checking methods
   */
  private canAccessCall(auth: SocketAuthPayload, callId: string): boolean {
    // Implement call access permissions
    return ['admin', 'supervisor', 'agent'].includes(auth.role);
  }

  private canAccessCampaign(auth: SocketAuthPayload, campaignId: string): boolean {
    // Implement campaign access permissions
    return ['admin', 'supervisor'].includes(auth.role);
  }

  private canInterveneCalls(auth: SocketAuthPayload): boolean {
    return ['admin', 'supervisor'].includes(auth.role);
  }

  /**
   * Helper methods
   */
  private determineAlertTargets(alert: SystemAlert): string[] {
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
        // Only to admins by default
        targets.push('role:admin');
        break;
    }

    return targets;
  }

  private handleCampaignUpdate(update: CampaignUpdate): void {
    // Find account ID for campaign and broadcast
    // This would require a database lookup or cache
  }

  /**
   * Health monitoring and cleanup
   */
  private startHeartbeat(): void {
    setInterval(async () => {
      try {
        // Cleanup disconnected sockets
        const connectedSockets = await this.io.fetchSockets();
        const connectedIds = new Set(connectedSockets.map(s => s.id));
        
        for (const [socketId] of this.authenticatedSockets) {
          if (!connectedIds.has(socketId)) {
            this.authenticatedSockets.delete(socketId);
          }
        }

        // Update system metrics
        await this.updateSystemMetrics();

      } catch (error) {
        console.error('Error in heartbeat:', error);
      }
    }, 30000); // Every 30 seconds
  }

  private async updateSystemMetrics(): Promise<void> {
    try {
      const metrics = {
        connectedSockets: this.io.engine.clientsCount,
        authenticatedUsers: this.authenticatedSockets.size,
        totalRooms: this.io.sockets.adapter.rooms.size,
        timestamp: new Date()
      };

      await this.redisClient.setex('realtime:metrics', 60, JSON.stringify(metrics));
    } catch (error) {
      console.error('Error updating system metrics:', error);
    }
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down real-time manager...');
    
    try {
      await this.redisClient.quit();
      await this.redisSubscriber.quit();
      this.io.close();
      console.log('Real-time manager shutdown complete');
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  }
}

export default RealTimeManager;
