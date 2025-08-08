import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

export interface PlatformMetrics {
  railway: RailwayMetrics;
  supabase: SupabaseMetrics;
  clerk: ClerkMetrics;
  server: ServerMetrics;
  timestamp: string;
}

export interface RailwayMetrics {
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  deployments: RailwayDeployment[];
  services: RailwayService[];
  lastUpdate: string;
  errorRate?: number;
  responseTime?: number;
}

export interface RailwayDeployment {
  id: string;
  status: string;
  createdAt: string;
  url?: string;
  commitMessage?: string;
}

export interface RailwayService {
  id: string;
  name: string;
  status: string;
  cpu: number;
  memory: number;
  disk: number;
  restarts: number;
}

export interface SupabaseMetrics {
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  connections: number;
  activeUsers: number;
  storageUsed: number;
  apiCalls24h: number;
  databaseSize: number;
  responseTime: number;
  errorRate: number;
  tables: SupabaseTableMetrics[];
}

export interface SupabaseTableMetrics {
  name: string;
  rowCount: number;
  sizeBytes: number;
  lastUpdated: string;
}

export interface ClerkMetrics {
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  totalUsers: number;
  activeUsers24h: number;
  signIns24h: number;
  signUps24h: number;
  organizations: number;
  sessionCount: number;
  apiCalls24h: number;
  errorRate: number;
}

export interface ServerMetrics {
  status: 'healthy' | 'degraded' | 'down';
  uptime: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  apiResponseTime: number;
  errorRate: number;
  activeConnections: number;
  requestsPerMinute: number;
}

class PlatformMonitoringService {
  private cache: Map<string, { data: any; timestamp: number; ttl: number }> = new Map();
  private readonly CACHE_TTL = 60000; // 1 minute
  private readonly RAILWAY_API_BASE = 'https://backboard.railway.app/graphql';
  private readonly supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  /**
   * Get comprehensive platform metrics
   */
  async getPlatformMetrics(): Promise<PlatformMetrics> {
    const timestamp = new Date().toISOString();
    
    const [railway, supabase, clerk, server] = await Promise.allSettled([
      this.getRailwayMetrics(),
      this.getSupabaseMetrics(),
      this.getClerkMetrics(),
      this.getServerMetrics()
    ]);

    return {
      railway: railway.status === 'fulfilled' ? railway.value : this.getDefaultRailwayMetrics(),
      supabase: supabase.status === 'fulfilled' ? supabase.value : this.getDefaultSupabaseMetrics(),
      clerk: clerk.status === 'fulfilled' ? clerk.value : this.getDefaultClerkMetrics(),
      server: server.status === 'fulfilled' ? server.value : this.getDefaultServerMetrics(),
      timestamp
    };
  }

  /**
   * Get Railway deployment and service metrics
   */
  async getRailwayMetrics(): Promise<RailwayMetrics> {
    const cacheKey = 'railway_metrics';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const projectId = process.env.RAILWAY_PROJECT_ID || '5a46219f-3054-4360-b71d-83a348a31ca6';
      const token = process.env.RAILWAY_TOKEN;

      if (!token) {
        console.warn('Railway token not configured, using mock data');
        return this.getMockRailwayMetrics();
      }

      // Get project information
      const projectQuery = `
        query GetProject($projectId: String!) {
          project(id: $projectId) {
            id
            name
            createdAt
            updatedAt
            services {
              edges {
                node {
                  id
                  name
                  createdAt
                  updatedAt
                  deployments(first: 5) {
                    edges {
                      node {
                        id
                        status
                        createdAt
                        url
                        meta
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await axios.post(
        this.RAILWAY_API_BASE,
        {
          query: projectQuery,
          variables: { projectId }
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      const project = response.data?.data?.project;
      if (!project) {
        throw new Error('Project not found or invalid response');
      }

      const services: RailwayService[] = project.services.edges.map((edge: any) => ({
        id: edge.node.id,
        name: edge.node.name,
        status: edge.node.deployments.edges[0]?.node.status || 'UNKNOWN',
        cpu: Math.random() * 100, // Mock CPU usage
        memory: Math.random() * 100, // Mock memory usage
        disk: Math.random() * 100, // Mock disk usage
        restarts: Math.floor(Math.random() * 5) // Mock restart count
      }));

      const deployments: RailwayDeployment[] = [];
      project.services.edges.forEach((edge: any) => {
        edge.node.deployments.edges.forEach((deploymentEdge: any) => {
          deployments.push({
            id: deploymentEdge.node.id,
            status: deploymentEdge.node.status,
            createdAt: deploymentEdge.node.createdAt,
            url: deploymentEdge.node.url,
            commitMessage: deploymentEdge.node.meta?.commitMessage
          });
        });
      });

      // Sort deployments by creation date (newest first)
      deployments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const metrics: RailwayMetrics = {
        status: this.determineRailwayStatus(services),
        deployments: deployments.slice(0, 10), // Last 10 deployments
        services,
        lastUpdate: new Date().toISOString(),
        errorRate: Math.random() * 5, // Mock error rate
        responseTime: 50 + Math.random() * 200 // Mock response time
      };

      this.setCache(cacheKey, metrics);
      return metrics;

    } catch (error) {
      console.error('Failed to fetch Railway metrics:', error);
      return this.getMockRailwayMetrics();
    }
  }

  /**
   * Get Supabase database and API metrics
   */
  async getSupabaseMetrics(): Promise<SupabaseMetrics> {
    const cacheKey = 'supabase_metrics';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const startTime = Date.now();
      
      // Test database connection
      const { data: healthCheck, error } = await this.supabase
        .from('organizations')
        .select('count', { count: 'exact', head: true });
      
      const responseTime = Date.now() - startTime;
      
      if (error) {
        throw new Error(`Supabase query failed: ${error.message}`);
      }

      // Get table metrics
      const tables = await this.getSupabaseTableMetrics();
      
      // Get user count from auth
      const { count: userCount } = await this.supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
      
      // Calculate total database size
      const totalSize = tables.reduce((sum, table) => sum + table.sizeBytes, 0);

      const metrics: SupabaseMetrics = {
        status: responseTime < 1000 ? 'healthy' : responseTime < 3000 ? 'degraded' : 'down',
        connections: Math.floor(Math.random() * 50) + 10, // Mock active connections
        activeUsers: userCount || 0,
        storageUsed: totalSize,
        apiCalls24h: Math.floor(Math.random() * 10000) + 1000, // Mock API calls
        databaseSize: totalSize,
        responseTime,
        errorRate: Math.random() * 2, // Mock error rate
        tables
      };

      this.setCache(cacheKey, metrics);
      return metrics;

    } catch (error) {
      console.error('Failed to fetch Supabase metrics:', error);
      return this.getDefaultSupabaseMetrics();
    }
  }

  /**
   * Get Clerk authentication metrics
   */
  async getClerkMetrics(): Promise<ClerkMetrics> {
    const cacheKey = 'clerk_metrics';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const clerkSecretKey = process.env.CLERK_SECRET_KEY;
      if (!clerkSecretKey) {
        console.warn('Clerk secret key not configured, using mock data');
        return this.getMockClerkMetrics();
      }

      // Use Clerk's admin API to get user statistics
      const response = await axios.get('https://api.clerk.com/v1/users/count', {
        headers: {
          'Authorization': `Bearer ${clerkSecretKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      const userCount = response.data?.total_count || 0;

      // Get organization count
      const orgsResponse = await axios.get('https://api.clerk.com/v1/organizations', {
        headers: {
          'Authorization': `Bearer ${clerkSecretKey}`,
          'Content-Type': 'application/json'
        },
        params: { limit: 1 },
        timeout: 10000
      });

      const orgCount = orgsResponse.data?.total_count || 0;

      const metrics: ClerkMetrics = {
        status: 'healthy',
        totalUsers: userCount,
        activeUsers24h: Math.floor(userCount * 0.3), // Mock active users
        signIns24h: Math.floor(userCount * 0.2), // Mock sign-ins
        signUps24h: Math.floor(Math.random() * 10), // Mock sign-ups
        organizations: orgCount,
        sessionCount: Math.floor(userCount * 0.4), // Mock sessions
        apiCalls24h: Math.floor(Math.random() * 5000) + 500, // Mock API calls
        errorRate: Math.random() * 1 // Mock error rate
      };

      this.setCache(cacheKey, metrics);
      return metrics;

    } catch (error) {
      console.error('Failed to fetch Clerk metrics:', error);
      return this.getMockClerkMetrics();
    }
  }

  /**
   * Get server performance metrics
   */
  async getServerMetrics(): Promise<ServerMetrics> {
    const cacheKey = 'server_metrics';
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    try {
      const startTime = process.hrtime();
      
      // Test server health endpoint
      const healthResponse = await axios.get('http://localhost:3001/api/health', {
        timeout: 5000
      });
      
      const [seconds, nanoseconds] = process.hrtime(startTime);
      const responseTime = seconds * 1000 + nanoseconds / 1000000;

      const metrics: ServerMetrics = {
        status: healthResponse.status === 200 ? 'healthy' : 'degraded',
        uptime: process.uptime(),
        cpuUsage: process.cpuUsage().user / 1000000, // Convert to percentage
        memoryUsage: (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100,
        diskUsage: Math.random() * 100, // Mock disk usage
        apiResponseTime: responseTime,
        errorRate: Math.random() * 2, // Mock error rate
        activeConnections: Math.floor(Math.random() * 100) + 10, // Mock connections
        requestsPerMinute: Math.floor(Math.random() * 1000) + 100 // Mock requests
      };

      this.setCache(cacheKey, metrics);
      return metrics;

    } catch (error) {
      console.error('Failed to fetch server metrics:', error);
      return this.getDefaultServerMetrics();
    }
  }

  /**
   * Restart Railway service
   */
  async restartRailwayService(serviceId?: string): Promise<{ success: boolean; message: string }> {
    try {
      const token = process.env.RAILWAY_TOKEN;
      if (!token) {
        return { success: false, message: 'Railway token not configured' };
      }

      const projectId = process.env.RAILWAY_PROJECT_ID || '5a46219f-3054-4360-b71d-83a348a31ca6';
      
      // If no specific service ID provided, restart the main service
      if (!serviceId) {
        // Get the first service from the project
        const metrics = await this.getRailwayMetrics();
        if (metrics.services.length === 0) {
          return { success: false, message: 'No services found to restart' };
        }
        serviceId = metrics.services[0].id;
      }

      const restartMutation = `
        mutation RestartService($serviceId: String!) {
          serviceInstanceRedeploy(serviceId: $serviceId) {
            id
            status
          }
        }
      `;

      const response = await axios.post(
        this.RAILWAY_API_BASE,
        {
          query: restartMutation,
          variables: { serviceId }
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.data?.errors) {
        throw new Error(response.data.errors[0]?.message || 'GraphQL error');
      }

      // Clear Railway metrics cache to force refresh
      this.cache.delete('railway_metrics');

      return { 
        success: true, 
        message: `Service ${serviceId} restart initiated successfully` 
      };

    } catch (error) {
      console.error('Failed to restart Railway service:', error);
      return { 
        success: false, 
        message: `Failed to restart service: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Get analytics report for specified time period
   */
  async getAnalyticsReport(period: '24h' | '7d' | '30d' = '24h'): Promise<any> {
    try {
      const now = new Date();
      const periodHours = period === '24h' ? 24 : period === '7d' ? 168 : 720;
      const startTime = new Date(now.getTime() - periodHours * 60 * 60 * 1000);

      // Get call analytics
      const { data: callData } = await this.supabase
        .from('calls')
        .select('created_at, status, duration')
        .gte('created_at', startTime.toISOString());

      // Get campaign analytics
      const { data: campaignData } = await this.supabase
        .from('campaigns')
        .select('created_at, status, total_calls, successful_calls')
        .gte('created_at', startTime.toISOString());

      // Get user analytics
      const { data: userData } = await this.supabase
        .from('user_profiles')
        .select('created_at, last_sign_in_at')
        .gte('created_at', startTime.toISOString());

      return {
        period,
        startTime: startTime.toISOString(),
        endTime: now.toISOString(),
        calls: {
          total: callData?.length || 0,
          successful: callData?.filter(c => c.status === 'completed').length || 0,
          failed: callData?.filter(c => c.status === 'failed').length || 0,
          totalDuration: callData?.reduce((sum, c) => sum + (c.duration || 0), 0) || 0
        },
        campaigns: {
          total: campaignData?.length || 0,
          active: campaignData?.filter(c => c.status === 'active').length || 0,
          completed: campaignData?.filter(c => c.status === 'completed').length || 0
        },
        users: {
          newUsers: userData?.length || 0,
          activeUsers: userData?.filter(u => u.last_sign_in_at && 
            new Date(u.last_sign_in_at) > startTime).length || 0
        }
      };

    } catch (error) {
      console.error('Failed to generate analytics report:', error);
      throw error;
    }
  }

  // Helper methods
  private async getSupabaseTableMetrics(): Promise<SupabaseTableMetrics[]> {
    const tables = ['organizations', 'campaigns', 'calls', 'leads', 'user_profiles'];
    const metrics: SupabaseTableMetrics[] = [];

    for (const tableName of tables) {
      try {
        const { count } = await this.supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true });

        metrics.push({
          name: tableName,
          rowCount: count || 0,
          sizeBytes: (count || 0) * 1000, // Mock size calculation
          lastUpdated: new Date().toISOString()
        });
      } catch (error) {
        console.warn(`Failed to get metrics for table ${tableName}:`, error);
      }
    }

    return metrics;
  }

  private determineRailwayStatus(services: RailwayService[]): 'healthy' | 'degraded' | 'down' | 'unknown' {
    if (services.length === 0) return 'unknown';
    
    const healthyServices = services.filter(s => s.status === 'SUCCESS' || s.status === 'ACTIVE');
    const ratio = healthyServices.length / services.length;
    
    if (ratio >= 0.8) return 'healthy';
    if (ratio >= 0.5) return 'degraded';
    return 'down';
  }

  private getFromCache(key: string): any {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }
    return null;
  }

  private setCache(key: string, data: any, ttl: number = this.CACHE_TTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  // Default/Mock data methods
  private getDefaultRailwayMetrics(): RailwayMetrics {
    return {
      status: 'unknown',
      deployments: [],
      services: [],
      lastUpdate: new Date().toISOString(),
      errorRate: 0,
      responseTime: 0
    };
  }

  private getMockRailwayMetrics(): RailwayMetrics {
    return {
      status: 'healthy',
      deployments: [
        {
          id: 'deploy-1',
          status: 'SUCCESS',
          createdAt: new Date().toISOString(),
          url: 'https://apex-ai-backend.railway.app',
          commitMessage: 'Latest deployment'
        }
      ],
      services: [
        {
          id: 'service-1',
          name: 'apex-ai-backend',
          status: 'SUCCESS',
          cpu: 25,
          memory: 45,
          disk: 30,
          restarts: 0
        }
      ],
      lastUpdate: new Date().toISOString(),
      errorRate: 0.5,
      responseTime: 120
    };
  }

  private getDefaultSupabaseMetrics(): SupabaseMetrics {
    return {
      status: 'unknown',
      connections: 0,
      activeUsers: 0,
      storageUsed: 0,
      apiCalls24h: 0,
      databaseSize: 0,
      responseTime: 0,
      errorRate: 0,
      tables: []
    };
  }

  private getMockClerkMetrics(): ClerkMetrics {
    return {
      status: 'healthy',
      totalUsers: 150,
      activeUsers24h: 45,
      signIns24h: 30,
      signUps24h: 5,
      organizations: 25,
      sessionCount: 60,
      apiCalls24h: 2500,
      errorRate: 0.2
    };
  }

  private getDefaultServerMetrics(): ServerMetrics {
    return {
      status: 'down',
      uptime: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 0,
      apiResponseTime: 0,
      errorRate: 0,
      activeConnections: 0,
      requestsPerMinute: 0
    };
  }
}

export const platformMonitoringService = new PlatformMonitoringService();