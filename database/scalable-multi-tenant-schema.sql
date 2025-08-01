-- Scalable Multi-Tenant Schema for VAPI Platform
-- Designed for hundreds of clients with millions of leads

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fast text search
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- For composite indexes

-- Organizations table with proper indexing
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL, -- For subdomain access
    type VARCHAR(50) CHECK (type IN ('platform', 'client')) DEFAULT 'client',
    status VARCHAR(50) DEFAULT 'active',
    
    -- VAPI Integration
    vapi_api_key TEXT, -- Encrypted
    vapi_webhook_secret TEXT, -- Encrypted
    vapi_phone_number_id TEXT,
    
    -- Billing
    subscription_plan VARCHAR(50) DEFAULT 'starter',
    subscription_status VARCHAR(50) DEFAULT 'active',
    credits_balance INTEGER DEFAULT 0,
    monthly_spend DECIMAL(10,2) DEFAULT 0,
    
    -- Settings
    settings JSONB DEFAULT '{}',
    features JSONB DEFAULT '{}', -- Feature flags
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes for performance
    INDEX idx_org_slug (slug),
    INDEX idx_org_status (status),
    INDEX idx_org_type (type)
);

-- Users table with organization partitioning
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(50) NOT NULL,
    
    -- Authentication
    clerk_user_id VARCHAR(255) UNIQUE,
    last_login TIMESTAMPTZ,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Composite unique constraint
    UNIQUE(organization_id, email),
    
    -- Indexes
    INDEX idx_users_org_id (organization_id),
    INDEX idx_users_email (email),
    INDEX idx_users_clerk_id (clerk_user_id)
);

-- Leads table - Partitioned by organization for scale
CREATE TABLE leads (
    id UUID DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Contact Info
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50) NOT NULL,
    
    -- Lead Data
    status VARCHAR(50) DEFAULT 'new',
    source VARCHAR(100),
    campaign_id UUID,
    tags TEXT[],
    custom_fields JSONB DEFAULT '{}',
    
    -- Call History
    last_called_at TIMESTAMPTZ,
    call_count INTEGER DEFAULT 0,
    total_talk_time INTEGER DEFAULT 0, -- seconds
    
    -- Scoring
    lead_score INTEGER DEFAULT 0,
    qualification_status VARCHAR(50),
    
    -- Import tracking
    import_batch_id UUID,
    external_id VARCHAR(255), -- For duplicate prevention
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    PRIMARY KEY (organization_id, id)
) PARTITION BY HASH (organization_id);

-- Create lead partitions (for 100 partitions)
DO $$
BEGIN
    FOR i IN 0..99 LOOP
        EXECUTE format('CREATE TABLE leads_p%s PARTITION OF leads FOR VALUES WITH (modulus 100, remainder %s)', i, i);
    END LOOP;
END $$;

-- Lead imports table for CSV processing
CREATE TABLE lead_imports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Import details
    filename VARCHAR(255),
    total_rows INTEGER,
    processed_rows INTEGER DEFAULT 0,
    successful_rows INTEGER DEFAULT 0,
    failed_rows INTEGER DEFAULT 0,
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending',
    error_log JSONB DEFAULT '[]',
    mapping_config JSONB, -- Column mapping configuration
    
    -- Processing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    INDEX idx_imports_org_id (organization_id),
    INDEX idx_imports_status (status)
);

-- VAPI Assistants table
CREATE TABLE vapi_assistants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- VAPI Data
    vapi_assistant_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50), -- 'inbound', 'outbound', 'web'
    
    -- Configuration
    config JSONB NOT NULL, -- Full VAPI assistant config
    voice_id VARCHAR(255),
    first_message TEXT,
    system_prompt TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    INDEX idx_assistants_org_id (organization_id),
    INDEX idx_assistants_vapi_id (vapi_assistant_id)
);

-- Campaigns table
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'outbound', 'inbound', 'sms'
    status VARCHAR(50) DEFAULT 'draft',
    
    -- VAPI Configuration
    assistant_id UUID REFERENCES vapi_assistants(id),
    phone_number_id VARCHAR(255),
    
    -- Campaign settings
    settings JSONB DEFAULT '{}',
    schedule JSONB, -- Call times, days, etc.
    
    -- Performance
    total_calls INTEGER DEFAULT 0,
    successful_calls INTEGER DEFAULT 0,
    total_duration INTEGER DEFAULT 0, -- seconds
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    INDEX idx_campaigns_org_id (organization_id),
    INDEX idx_campaigns_status (status)
);

-- Calls table - Partitioned by date for performance
CREATE TABLE calls (
    id UUID DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- VAPI Data
    vapi_call_id VARCHAR(255) UNIQUE NOT NULL,
    assistant_id UUID REFERENCES vapi_assistants(id),
    
    -- Call Details
    lead_id UUID,
    campaign_id UUID REFERENCES campaigns(id),
    phone_number VARCHAR(50),
    direction VARCHAR(20), -- 'inbound' or 'outbound'
    
    -- Timing
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration INTEGER, -- seconds
    
    -- Status
    status VARCHAR(50),
    end_reason VARCHAR(100),
    
    -- Content
    recording_url TEXT,
    transcript JSONB,
    summary TEXT,
    
    -- Analytics
    sentiment_score DECIMAL(3,2),
    key_moments JSONB,
    
    -- Cost
    cost DECIMAL(10,4),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    PRIMARY KEY (started_at, id)
) PARTITION BY RANGE (started_at);

-- Create monthly partitions for calls
CREATE TABLE calls_2025_01 PARTITION OF calls FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE calls_2025_02 PARTITION OF calls FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
-- Add more partitions as needed

-- Platform analytics table
CREATE TABLE platform_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    
    -- Platform metrics
    total_organizations INTEGER DEFAULT 0,
    active_organizations INTEGER DEFAULT 0,
    total_calls INTEGER DEFAULT 0,
    total_minutes INTEGER DEFAULT 0,
    
    -- Financial metrics
    total_revenue DECIMAL(10,2) DEFAULT 0,
    total_costs DECIMAL(10,2) DEFAULT 0,
    
    -- Usage metrics
    total_leads INTEGER DEFAULT 0,
    total_campaigns INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(date)
);

-- Quick access table for platform owner
CREATE TABLE platform_quick_access (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    last_accessed TIMESTAMPTZ DEFAULT NOW(),
    access_count INTEGER DEFAULT 1,
    
    UNIQUE(user_id, organization_id),
    INDEX idx_quick_access_user (user_id),
    INDEX idx_quick_access_accessed (last_accessed DESC)
);

-- Create search indexes for fast client lookup
CREATE INDEX idx_org_search ON organizations USING gin(
    to_tsvector('english', name || ' ' || COALESCE(slug, ''))
);

-- Create materialized view for platform dashboard
CREATE MATERIALIZED VIEW platform_dashboard_stats AS
SELECT 
    COUNT(DISTINCT o.id) as total_clients,
    COUNT(DISTINCT CASE WHEN o.status = 'active' THEN o.id END) as active_clients,
    SUM(o.monthly_spend) as total_monthly_revenue,
    COUNT(DISTINCT c.id) as total_calls_today,
    COUNT(DISTINCT l.id) as total_leads
FROM organizations o
LEFT JOIN calls c ON c.organization_id = o.id AND c.started_at >= CURRENT_DATE
LEFT JOIN leads l ON l.organization_id = o.id
WHERE o.type = 'client';

-- Refresh dashboard stats every hour
CREATE OR REPLACE FUNCTION refresh_platform_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY platform_dashboard_stats;
END;
$$ LANGUAGE plpgsql;

-- Row Level Security Policies
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- Platform owner can see everything
CREATE POLICY platform_owner_all ON organizations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role = 'platform_owner'
        )
    );

-- Users can only see their organization
CREATE POLICY users_own_org ON organizations
    FOR SELECT USING (
        id IN (
            SELECT organization_id FROM users 
            WHERE users.id = auth.uid()
        )
    );

-- Indexes for common queries
CREATE INDEX idx_leads_phone ON leads(phone);
CREATE INDEX idx_leads_status ON leads(organization_id, status);
CREATE INDEX idx_calls_lead ON calls(lead_id);
CREATE INDEX idx_calls_campaign ON calls(campaign_id); 