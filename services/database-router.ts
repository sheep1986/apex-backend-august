// Database Router Service for Multi-Tenant Architecture
// Handles routing to appropriate database based on agency/account

import { createClient } from '@supabase/supabase-js';

interface DatabaseConfig {
  url: string;
  key: string;
  type: 'platform' | 'agency' | 'analytics';
}

interface AgencyDatabaseInfo {
  agencySlug: string;
  databaseUrl: string;
  apiKey: string;
  createdAt: Date;
  isActive: boolean;
}

class DatabaseRouter {
  private connections: Map<string, any> = new Map();
  private isMultiDatabaseMode: boolean = false;

  constructor() {
    // Check if we're in multi-database mode
    this.isMultiDatabaseMode = process.env.MULTI_DATABASE_MODE === 'true';
  }

  /**
   * Get database connection for specific agency
   */
  async getAgencyDatabase(agencySlug: string) {
    if (!this.isMultiDatabaseMode) {
      // Single database mode - return main Supabase client
      return this.getMainDatabase();
    }

    // Multi-database mode - route to agency-specific database
    const connectionKey = `agency-${agencySlug}`;
    
    if (!this.connections.has(connectionKey)) {
      const dbConfig = await this.getAgencyDatabaseConfig(agencySlug);
      const client = createClient(dbConfig.url, dbConfig.key);
      this.connections.set(connectionKey, client);
    }

    return this.connections.get(connectionKey);
  }

  /**
   * Get main platform database (for user management, billing, etc.)
   */
  getMainDatabase() {
    const connectionKey = 'main-database';
    
    if (!this.connections.has(connectionKey)) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Main database credentials not configured');
      }
      
      const client = createClient(supabaseUrl, supabaseKey);
      this.connections.set(connectionKey, client);
    }

    return this.connections.get(connectionKey);
  }

  /**
   * Get analytics database for cross-agency reporting
   */
  getAnalyticsDatabase() {
    const connectionKey = 'analytics-database';
    
    if (!this.connections.has(connectionKey)) {
      const analyticsUrl = process.env.SUPABASE_ANALYTICS_URL || process.env.SUPABASE_URL || '';
      const analyticsKey = process.env.SUPABASE_ANALYTICS_KEY || process.env.SUPABASE_ANON_KEY || '';
      
      if (!analyticsUrl || !analyticsKey) {
        throw new Error('Analytics database credentials not configured');
      }
      
      const client = createClient(analyticsUrl, analyticsKey);
      this.connections.set(connectionKey, client);
    }

    return this.connections.get(connectionKey);
  }

  /**
   * Create new database for agency (for scaling)
   */
  async createAgencyDatabase(agencySlug: string): Promise<DatabaseConfig> {
    if (!this.isMultiDatabaseMode) {
      throw new Error('Multi-database mode not enabled');
    }

    try {
      // In production, this would call Supabase API to create new project
      // For development, we simulate the process
      
      const databaseUrl = `https://apex-agency-${agencySlug}.supabase.co`;
      const apiKey = `generated-api-key-for-${agencySlug}`;
      
      // Register new database in platform master database
      const platformDb = this.getMainDatabase();
      await platformDb.from('database_registry').insert({
        agency_slug: agencySlug,
        database_url: databaseUrl,
        api_key: apiKey,
        is_active: true,
        created_at: new Date().toISOString()
      });

      // Run schema setup on new database
      await this.setupAgencyDatabaseSchema(databaseUrl, apiKey);

      return {
        url: databaseUrl,
        key: apiKey,
        type: 'agency'
      };
    } catch (error) {
      console.error('Failed to create agency database:', error);
      throw error;
    }
  }

  /**
   * Get database configuration for specific agency
   */
  private async getAgencyDatabaseConfig(agencySlug: string): Promise<DatabaseConfig> {
    try {
      // Check if agency has dedicated database
      const platformDb = this.getMainDatabase();
      const { data, error } = await platformDb
        .from('database_registry')
        .select('*')
        .eq('agency_slug', agencySlug)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        // Fallback to main database if no dedicated database found
        console.log(`No dedicated database found for ${agencySlug}, using main database`);
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
          throw new Error('Main database credentials not configured');
        }
        
        return {
          url: supabaseUrl,
          key: supabaseKey,
          type: 'platform'
        };
      }

      return {
        url: data.database_url,
        key: data.api_key,
        type: 'agency'
      };
    } catch (error) {
      console.error('Failed to get agency database config:', error);
      throw error;
    }
  }

  /**
   * Set up schema on new agency database
   */
  private async setupAgencyDatabaseSchema(databaseUrl: string, apiKey: string) {
    // In production, this would run the full schema.sql on the new database
    console.log(`Setting up schema for database: ${databaseUrl}`);
    
    // This is where you'd run all the CREATE TABLE statements
    // For now, we'll just log the action
    // In real implementation, you'd use the service role key to run SQL
  }

  /**
   * Health check for all databases
   */
  async healthCheck(): Promise<{ [key: string]: boolean }> {
    const health: { [key: string]: boolean } = {};

    try {
      // Check main database
      const mainDb = this.getMainDatabase();
      const { error: mainError } = await mainDb.from('accounts').select('count').limit(1);
      health.main = !mainError;

      // Check analytics database
      const analyticsDb = this.getAnalyticsDatabase();
      const { error: analyticsError } = await analyticsDb.from('accounts').select('count').limit(1);
      health.analytics = !analyticsError;

      // In multi-database mode, check all agency databases
      if (this.isMultiDatabaseMode) {
        const { data: agencies } = await mainDb.from('database_registry').select('agency_slug');
        
        if (agencies) {
          for (const agency of agencies) {
            try {
              const agencyDb = await this.getAgencyDatabase(agency.agency_slug);
              const { error } = await agencyDb.from('accounts').select('count').limit(1);
              health[`agency-${agency.agency_slug}`] = !error;
            } catch (error) {
              health[`agency-${agency.agency_slug}`] = false;
            }
          }
        }
      }

      return health;
    } catch (error) {
      console.error('Health check failed:', error);
      return { error: false };
    }
  }

  /**
   * Close all database connections
   */
  async closeAllConnections() {
    // Supabase client doesn't need explicit closing, but we clear the cache
    this.connections.clear();
  }
}

// Export singleton instance
export const databaseRouter = new DatabaseRouter();
export default databaseRouter; 