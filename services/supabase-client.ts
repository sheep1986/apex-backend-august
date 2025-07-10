// Shared Supabase Client for Apex AI Calling Platform
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables first
config();

// Centralized Supabase client with environment variable handling
class SupabaseService {
  private client: any;
  private isConnected: boolean = false;

  constructor() {
    this.initializeClient();
  }

  private initializeClient() {
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

      console.log('🔍 Supabase initialization check:');
      console.log('   - Has URL:', !!supabaseUrl);
      console.log('   - Has Key:', !!supabaseKey);
      
      if (!supabaseUrl || !supabaseKey) {
        console.error('❌ Missing Supabase credentials:');
        if (!supabaseUrl) console.error('   - SUPABASE_URL not set');
        if (!supabaseKey) console.error('   - SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY not set');
        throw new Error('Missing Supabase credentials');
      }

      console.log('🔗 Supabase: Connecting to production database');
      console.log('   URL:', supabaseUrl);
      console.log('   Using key type:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'service_role' : 'anon');
      
      this.client = createClient(supabaseUrl, supabaseKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: false
        }
      });
      this.isConnected = true;
      console.log('✅ Supabase: Connected successfully!');
      
      // Test the connection
      this.testConnection();
    } catch (error) {
      console.error('❌ Supabase initialization error:', error);
      this.isConnected = false;
      throw error;
    }
  }

  private async testConnection() {
    try {
      const { data, error } = await this.client.from('users').select('count').limit(1);
      if (error) throw error;
      console.log('✅ Supabase connection test successful');
      return true;
    } catch (error) {
      console.error('❌ Supabase connection test failed:', error);
      return false;
    }
  }

  // Helper method to check if we're connected to real Supabase
  public isRealConnection(): boolean {
    return this.isConnected;
  }

  // Get the client instance
  public getClient() {
    if (!this.client || !this.isConnected) {
      throw new Error('Supabase client not initialized');
    }
    return this.client;
  }

  // Proxy methods for common operations
  public from(table: string) {
    return this.client.from(table);
  }

  public auth() {
    return this.client.auth;
  }

  public storage() {
    return this.client.storage;
  }

  public rpc(fn: string, args?: any) {
    return this.client.rpc(fn, args);
  }
}

// Create singleton instance
const supabaseServiceInstance = new SupabaseService();

// Export the service instance as default 
export default supabaseServiceInstance;

// Also export the service instance for testing
export { supabaseServiceInstance as supabaseService }; 