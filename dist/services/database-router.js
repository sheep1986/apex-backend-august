"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseRouter = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
class DatabaseRouter {
    constructor() {
        this.connections = new Map();
        this.isMultiDatabaseMode = false;
        this.isMultiDatabaseMode = process.env.MULTI_DATABASE_MODE === 'true';
    }
    async getAgencyDatabase(agencySlug) {
        if (!this.isMultiDatabaseMode) {
            return this.getMainDatabase();
        }
        const connectionKey = `agency-${agencySlug}`;
        if (!this.connections.has(connectionKey)) {
            const dbConfig = await this.getAgencyDatabaseConfig(agencySlug);
            const client = (0, supabase_js_1.createClient)(dbConfig.url, dbConfig.key);
            this.connections.set(connectionKey, client);
        }
        return this.connections.get(connectionKey);
    }
    getMainDatabase() {
        const connectionKey = 'main-database';
        if (!this.connections.has(connectionKey)) {
            const supabaseUrl = process.env.SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_ANON_KEY;
            if (!supabaseUrl || !supabaseKey) {
                throw new Error('Main database credentials not configured');
            }
            const client = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
            this.connections.set(connectionKey, client);
        }
        return this.connections.get(connectionKey);
    }
    getAnalyticsDatabase() {
        const connectionKey = 'analytics-database';
        if (!this.connections.has(connectionKey)) {
            const analyticsUrl = process.env.SUPABASE_ANALYTICS_URL || process.env.SUPABASE_URL || '';
            const analyticsKey = process.env.SUPABASE_ANALYTICS_KEY || process.env.SUPABASE_ANON_KEY || '';
            if (!analyticsUrl || !analyticsKey) {
                throw new Error('Analytics database credentials not configured');
            }
            const client = (0, supabase_js_1.createClient)(analyticsUrl, analyticsKey);
            this.connections.set(connectionKey, client);
        }
        return this.connections.get(connectionKey);
    }
    async createAgencyDatabase(agencySlug) {
        if (!this.isMultiDatabaseMode) {
            throw new Error('Multi-database mode not enabled');
        }
        try {
            const databaseUrl = `https://apex-agency-${agencySlug}.supabase.co`;
            const apiKey = `generated-api-key-for-${agencySlug}`;
            const platformDb = this.getMainDatabase();
            await platformDb.from('database_registry').insert({
                agency_slug: agencySlug,
                database_url: databaseUrl,
                api_key: apiKey,
                is_active: true,
                created_at: new Date().toISOString()
            });
            await this.setupAgencyDatabaseSchema(databaseUrl, apiKey);
            return {
                url: databaseUrl,
                key: apiKey,
                type: 'agency'
            };
        }
        catch (error) {
            console.error('Failed to create agency database:', error);
            throw error;
        }
    }
    async getAgencyDatabaseConfig(agencySlug) {
        try {
            const platformDb = this.getMainDatabase();
            const { data, error } = await platformDb
                .from('database_registry')
                .select('*')
                .eq('agency_slug', agencySlug)
                .eq('is_active', true)
                .single();
            if (error || !data) {
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
        }
        catch (error) {
            console.error('Failed to get agency database config:', error);
            throw error;
        }
    }
    async setupAgencyDatabaseSchema(databaseUrl, apiKey) {
        console.log(`Setting up schema for database: ${databaseUrl}`);
    }
    async healthCheck() {
        const health = {};
        try {
            const mainDb = this.getMainDatabase();
            const { error: mainError } = await mainDb.from('accounts').select('count').limit(1);
            health.main = !mainError;
            const analyticsDb = this.getAnalyticsDatabase();
            const { error: analyticsError } = await analyticsDb.from('accounts').select('count').limit(1);
            health.analytics = !analyticsError;
            if (this.isMultiDatabaseMode) {
                const { data: agencies } = await mainDb.from('database_registry').select('agency_slug');
                if (agencies) {
                    for (const agency of agencies) {
                        try {
                            const agencyDb = await this.getAgencyDatabase(agency.agency_slug);
                            const { error } = await agencyDb.from('accounts').select('count').limit(1);
                            health[`agency-${agency.agency_slug}`] = !error;
                        }
                        catch (error) {
                            health[`agency-${agency.agency_slug}`] = false;
                        }
                    }
                }
            }
            return health;
        }
        catch (error) {
            console.error('Health check failed:', error);
            return { error: false };
        }
    }
    async closeAllConnections() {
        this.connections.clear();
    }
}
exports.databaseRouter = new DatabaseRouter();
exports.default = exports.databaseRouter;
