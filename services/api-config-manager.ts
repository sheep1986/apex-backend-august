import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import OpenAI from 'openai';
import supabase from './supabase-client';
import * as apiConfigController from '../api/api-configurations';
import crypto from 'crypto';

// This service manages external API configurations
// It does NOT replace the core database connection which uses environment variables

interface ExternalAPIs {
  stripe?: Stripe;
  openai?: OpenAI;
  externalSupabase?: any; // For client-specific Supabase instances
}

class APIConfigManager {
  private apis: ExternalAPIs = {};
  private userId: string | null = null;
  private encryptionKey: Buffer;

  constructor() {
    // Use same encryption key as api-configurations
    this.encryptionKey = process.env.API_ENCRYPTION_KEY ? 
      Buffer.from(process.env.API_ENCRYPTION_KEY, 'hex') : 
      crypto.randomBytes(32);
  }

  // Initialize with user context
  async initialize(userId: string) {
    this.userId = userId;
    await this.loadConfigurations();
  }

  // Decrypt helper
  private decrypt(encryptedText: string): string {
    if (!encryptedText) return '';
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 2) return '';
      
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      return '';
    }
  }

  // Load all configurations for the user
  private async loadConfigurations() {
    if (!this.userId) throw new Error('User ID not set');

    try {
      // Get all API configurations for this user
      const { data: configs, error } = await supabase
        .from('api_configurations')
        .select('service_name, configuration')
        .eq('user_id', this.userId);

      if (error) throw error;

      // Initialize each service
      for (const config of configs || []) {
        await this.initializeService(config.service_name, config.configuration);
      }
    } catch (error) {
      console.error('Error loading API configurations:', error);
    }
  }

  // Initialize a specific service
  private async initializeService(serviceName: string, encryptedConfig: any) {
    try {
      switch (serviceName) {
        case 'stripe':
          const stripeConfig = this.decryptConfig(encryptedConfig);
          if (stripeConfig.secretKey) {
            this.apis.stripe = new Stripe(stripeConfig.secretKey, {
              apiVersion: '2023-10-16',
            });
            console.log('✅ Stripe API initialized');
          }
          break;

        case 'openai':
          const openaiConfig = this.decryptConfig(encryptedConfig);
          if (openaiConfig.apiKey) {
            this.apis.openai = new OpenAI({
              apiKey: openaiConfig.apiKey,
              organization: openaiConfig.organizationId,
            });
            console.log('✅ OpenAI API initialized');
          }
          break;

        case 'supabase':
          // This is for external/client Supabase instances, NOT the main database
          const supabaseConfig = this.decryptConfig(encryptedConfig);
          if (supabaseConfig.url && supabaseConfig.anonKey) {
            this.apis.externalSupabase = createClient(
              supabaseConfig.url,
              supabaseConfig.anonKey
            );
            console.log('✅ External Supabase client initialized');
          }
          break;
      }
    } catch (error) {
      console.error(`Error initializing ${serviceName}:`, error);
    }
  }

  // Decrypt configuration object
  private decryptConfig(config: any): any {
    const decrypted: any = {};
    const sensitiveFields = ['publicKey', 'secretKey', 'webhookSecret', 'apiKey', 'organizationId', 'anonKey', 'serviceRoleKey'];
    
    for (const [key, value] of Object.entries(config)) {
      if (sensitiveFields.includes(key) && typeof value === 'string') {
        decrypted[key] = this.decrypt(value);
      } else {
        decrypted[key] = value;
      }
    }
    
    return decrypted;
  }

  // Get initialized Stripe instance
  getStripe(): Stripe | null {
    if (!this.apis.stripe) {
      console.warn('Stripe not initialized. Check API configuration.');
      return null;
    }
    return this.apis.stripe;
  }

  // Get initialized OpenAI instance
  getOpenAI(): OpenAI | null {
    if (!this.apis.openai) {
      console.warn('OpenAI not initialized. Check API configuration.');
      return null;
    }
    return this.apis.openai;
  }

  // Get external Supabase instance (for client projects)
  getExternalSupabase(): any | null {
    if (!this.apis.externalSupabase) {
      console.warn('External Supabase not initialized. Check API configuration.');
      return null;
    }
    return this.apis.externalSupabase;
  }

  // Refresh configurations
  async refresh() {
    this.apis = {};
    await this.loadConfigurations();
  }

  // Check if a service is configured
  isConfigured(serviceName: 'stripe' | 'openai' | 'supabase'): boolean {
    switch (serviceName) {
      case 'stripe':
        return !!this.apis.stripe;
      case 'openai':
        return !!this.apis.openai;
      case 'supabase':
        return !!this.apis.externalSupabase;
      default:
        return false;
    }
  }
}

// Export singleton instance
export const apiConfigManager = new APIConfigManager();

// Helper function to get API config manager for a specific user
export async function getAPIConfigManager(userId: string): Promise<APIConfigManager> {
  const manager = new APIConfigManager();
  await manager.initialize(userId);
  return manager;
}