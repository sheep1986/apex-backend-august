"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseService = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
class SupabaseService {
    constructor() {
        this.isConnected = false;
        this.initializeClient();
    }
    initializeClient() {
        try {
            const supabaseUrl = process.env.SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
            console.log('🔍 Supabase initialization check:');
            console.log('   - Has URL:', !!supabaseUrl);
            console.log('   - Has Key:', !!supabaseKey);
            if (!supabaseUrl || !supabaseKey) {
                console.error('❌ Missing Supabase credentials:');
                if (!supabaseUrl)
                    console.error('   - SUPABASE_URL not set');
                if (!supabaseKey)
                    console.error('   - SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY not set');
                throw new Error('Missing Supabase credentials');
            }
            console.log('🔗 Supabase: Connecting to production database');
            console.log('   URL:', supabaseUrl);
            console.log('   Using key type:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'service_role' : 'anon');
            this.client = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey, {
                auth: {
                    autoRefreshToken: true,
                    persistSession: false
                }
            });
            this.isConnected = true;
            console.log('✅ Supabase: Connected successfully!');
            this.testConnection();
        }
        catch (error) {
            console.error('❌ Supabase initialization error:', error);
            this.isConnected = false;
            throw error;
        }
    }
    async testConnection() {
        try {
            const { data, error } = await this.client.from('users').select('count').limit(1);
            if (error)
                throw error;
            console.log('✅ Supabase connection test successful');
            return true;
        }
        catch (error) {
            console.error('❌ Supabase connection test failed:', error);
            return false;
        }
    }
    isRealConnection() {
        return this.isConnected;
    }
    getClient() {
        if (!this.client || !this.isConnected) {
            throw new Error('Supabase client not initialized');
        }
        return this.client;
    }
    from(table) {
        return this.client.from(table);
    }
    auth() {
        return this.client.auth;
    }
    storage() {
        return this.client.storage;
    }
    rpc(fn, args) {
        return this.client.rpc(fn, args);
    }
}
const supabaseServiceInstance = new SupabaseService();
exports.supabaseService = supabaseServiceInstance;
exports.default = supabaseServiceInstance;
