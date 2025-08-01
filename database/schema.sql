-- AI Calling SaaS Platform - Complete Database Schema
-- Production-ready schema with all features

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom types for better type safety
CREATE TYPE plan_type AS ENUM ('starter', 'professional', 'enterprise', 'custom');
CREATE TYPE user_role AS ENUM ('admin', 'supervisor', 'agent', 'viewer');
CREATE TYPE campaign_type AS ENUM ('outbound', 'inbound', 'blended');
CREATE TYPE campaign_status AS ENUM ('draft', 'scheduled', 'active', 'paused', 'completed', 'archived');
CREATE TYPE dialer_mode AS ENUM ('preview', 'progressive', 'predictive', 'manual');
CREATE TYPE flow_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE call_status AS ENUM ('queued', 'dialing', 'ringing', 'active', 'completed', 'failed', 'cancelled');
CREATE TYPE call_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE call_disposition AS ENUM ('connected', 'no_answer', 'busy', 'voicemail', 'failed', 'cancelled', 'converted');
CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'qualified', 'not_qualified', 'converted', 'do_not_call', 'callback_scheduled', 'voicemail_left', 'busy', 'no_answer', 'failed');
CREATE TYPE dnc_status AS ENUM ('unknown', 'clear', 'listed', 'opt_out');
CREATE TYPE call_attempt_status AS ENUM ('scheduled', 'dialing', 'ringing', 'connected', 'completed', 'failed', 'busy', 'no_answer', 'voicemail', 'cancelled');
CREATE TYPE event_type AS ENUM ('call_started', 'call_connected', 'call_ended', 'message_sent', 'flow_completed', 'sentiment_changed', 'transfer_initiated');
CREATE TYPE compliance_type AS ENUM ('dnc_check', 'consent_capture', 'recording_notice', 'data_retention');
CREATE TYPE compliance_status AS ENUM ('compliant', 'violation', 'pending_review');
CREATE TYPE sentiment_type AS ENUM ('positive', 'neutral', 'negative', 'unknown');
CREATE TYPE risk_type AS ENUM ('low', 'medium', 'high');

-- Core Authentication & Account Management
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan_type plan_type DEFAULT 'starter',
    billing_email VARCHAR(255),
    settings JSONB DEFAULT '{}',
    limits JSONB DEFAULT '{}',
    usage_stats JSONB DEFAULT '{}',
    subscription_id VARCHAR(255),
    trial_ends_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    clerk_user_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role user_role DEFAULT 'agent',
    permissions JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    last_login_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Flow Management System
CREATE TABLE flows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    flow_json JSONB NOT NULL,
    version INTEGER DEFAULT 1,
    status flow_status DEFAULT 'draft',
    settings JSONB DEFAULT '{}',
    performance_metrics JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT flows_name_account_unique UNIQUE (account_id, name, version)
);

-- Enhanced Campaign Management
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type campaign_type DEFAULT 'outbound',
    status campaign_status DEFAULT 'draft',
    flow_id UUID REFERENCES flows(id),
    dialer_settings JSONB NOT NULL DEFAULT '{}',
    schedule_settings JSONB DEFAULT '{}',
    target_settings JSONB DEFAULT '{}',
    performance_metrics JSONB DEFAULT '{}',
    budget_settings JSONB DEFAULT '{}',
    compliance_settings JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT campaigns_name_account_unique UNIQUE (account_id, name)
);

-- Enhanced Lead Management
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    external_id VARCHAR(255), -- For CRM integration
    phone_number VARCHAR(20) NOT NULL,
    phone_number_formatted VARCHAR(25), -- E.164 format
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    company VARCHAR(255),
    title VARCHAR(255),
    address JSONB DEFAULT '{}',
    custom_fields JSONB DEFAULT '{}',
    status lead_status DEFAULT 'new',
    priority INTEGER DEFAULT 1,
    score INTEGER DEFAULT 0,
    tags TEXT[],
    dnc_status dnc_status DEFAULT 'unknown',
    opt_out_date TIMESTAMP WITH TIME ZONE,
    last_contacted_at TIMESTAMP WITH TIME ZONE,
    next_call_at TIMESTAMP WITH TIME ZONE,
    conversion_date TIMESTAMP WITH TIME ZONE,
    conversion_value DECIMAL(10,2),
    source VARCHAR(255),
    utm_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Comprehensive Call Session Management
CREATE TABLE call_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    flow_id UUID REFERENCES flows(id),
    assigned_agent_id UUID REFERENCES users(id),
    twilio_call_sid VARCHAR(255) UNIQUE,
    caller_number VARCHAR(20),
    callee_number VARCHAR(20),
    caller_id_used VARCHAR(20),
    status call_status DEFAULT 'queued',
    direction call_direction DEFAULT 'outbound',
    duration INTEGER DEFAULT 0, -- seconds
    billable_duration INTEGER DEFAULT 0,
    cost_cents INTEGER DEFAULT 0,
    recording_url TEXT,
    recording_duration INTEGER DEFAULT 0,
    transcript JSONB DEFAULT '{}',
    sentiment_analysis JSONB DEFAULT '{}',
    ai_insights JSONB DEFAULT '{}',
    flow_execution_data JSONB DEFAULT '{}',
    disposition call_disposition,
    disposition_notes TEXT,
    quality_score INTEGER, -- 1-5 rating
    compliance_data JSONB DEFAULT '{}',
    scheduled_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    connected_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Call Attempt Tracking
CREATE TABLE call_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    call_session_id UUID REFERENCES call_sessions(id) ON DELETE SET NULL,
    attempt_number INTEGER NOT NULL,
    status call_attempt_status DEFAULT 'scheduled',
    duration INTEGER DEFAULT 0,
    disposition VARCHAR(255),
    notes TEXT,
    cost_cents INTEGER DEFAULT 0,
    retry_reason VARCHAR(255),
    next_retry_at TIMESTAMP WITH TIME ZONE,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    attempted_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Real-time Event Tracking
CREATE TABLE call_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_session_id UUID REFERENCES call_sessions(id) ON DELETE CASCADE,
    event_type event_type NOT NULL,
    event_data JSONB NOT NULL DEFAULT '{}',
    sequence_number INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Agent Management & Performance
CREATE TABLE agent_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'available', -- available, busy, on_call, away, offline
    current_call_id UUID REFERENCES call_sessions(id),
    login_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    logout_time TIMESTAMP WITH TIME ZONE,
    total_calls INTEGER DEFAULT 0,
    total_duration INTEGER DEFAULT 0,
    performance_metrics JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Compliance & Audit Management
CREATE TABLE compliance_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    call_session_id UUID REFERENCES call_sessions(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    compliance_type compliance_type NOT NULL,
    status compliance_status DEFAULT 'compliant',
    details JSONB DEFAULT '{}',
    evidence_url TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- DNC (Do Not Call) List Management
CREATE TABLE dnc_lists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    source VARCHAR(255), -- 'internal', 'ftc', 'state', 'custom'
    phone_numbers TEXT[] NOT NULL,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    auto_update BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CRM Integration Management
CREATE TABLE crm_integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    crm_type VARCHAR(100) NOT NULL, -- 'salesforce', 'hubspot', 'pipedrive', etc.
    configuration JSONB NOT NULL DEFAULT '{}',
    credentials_encrypted TEXT,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    sync_status VARCHAR(50) DEFAULT 'pending',
    error_log JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Multi-Channel Communication
CREATE TABLE communication_sequences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    steps JSONB NOT NULL DEFAULT '[]',
    trigger_conditions JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SMS & WhatsApp Messages
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    sequence_id UUID REFERENCES communication_sequences(id) ON DELETE SET NULL,
    channel VARCHAR(50) NOT NULL, -- 'sms', 'whatsapp', 'email'
    direction VARCHAR(20) NOT NULL, -- 'inbound', 'outbound'
    message_sid VARCHAR(255), -- Twilio SID
    from_number VARCHAR(50),
    to_number VARCHAR(50),
    content TEXT,
    template_id VARCHAR(255),
    status VARCHAR(50),
    delivery_status VARCHAR(50),
    cost_cents INTEGER DEFAULT 0,
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Caller ID Management
CREATE TABLE caller_ids (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    friendly_name VARCHAR(255),
    is_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    twilio_sid VARCHAR(255),
    capabilities JSONB DEFAULT '{}',
    verification_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API Keys & Webhook Management
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    permissions JSONB DEFAULT '{}',
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    events TEXT[] NOT NULL,
    secret VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    retry_config JSONB DEFAULT '{}',
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analytics & Reporting Tables
CREATE TABLE analytics_daily (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    metrics JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(account_id, campaign_id, date)
);

CREATE TABLE analytics_hourly (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    hour TIMESTAMP WITH TIME ZONE NOT NULL,
    metrics JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(account_id, campaign_id, hour)
);

-- Billing & Usage Tracking
CREATE TABLE usage_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    resource_type VARCHAR(100) NOT NULL, -- 'calls', 'sms', 'storage', 'ai_minutes'
    quantity INTEGER NOT NULL,
    unit_cost_cents INTEGER,
    total_cost_cents INTEGER,
    billing_period VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for Performance
CREATE INDEX idx_accounts_slug ON accounts(slug);
CREATE INDEX idx_users_clerk_id ON users(clerk_user_id);
CREATE INDEX idx_users_account_role ON users(account_id, role);
CREATE INDEX idx_flows_account_status ON flows(account_id, status);
CREATE INDEX idx_campaigns_account_status ON campaigns(account_id, status);
CREATE INDEX idx_leads_campaign_status ON leads(campaign_id, status);
CREATE INDEX idx_leads_phone ON leads(phone_number_formatted);
CREATE INDEX idx_leads_next_call ON leads(next_call_at) WHERE next_call_at IS NOT NULL;
CREATE INDEX idx_call_sessions_account_status ON call_sessions(account_id, status);
CREATE INDEX idx_call_sessions_campaign_status ON call_sessions(campaign_id, status);
CREATE INDEX idx_call_sessions_twilio_sid ON call_sessions(twilio_call_sid);
CREATE INDEX idx_call_sessions_timerange ON call_sessions(account_id, created_at);
CREATE INDEX idx_call_events_session_timestamp ON call_events(call_session_id, timestamp);
CREATE INDEX idx_call_attempts_lead_status ON call_attempts(lead_id, status);
CREATE INDEX idx_compliance_account_type ON compliance_records(account_id, compliance_type);
CREATE INDEX idx_messages_lead_channel ON messages(lead_id, channel);
CREATE INDEX idx_analytics_daily_lookup ON analytics_daily(account_id, campaign_id, date);
CREATE INDEX idx_analytics_hourly_lookup ON analytics_hourly(account_id, campaign_id, hour);
CREATE INDEX idx_usage_records_account_period ON usage_records(account_id, billing_period);

-- Row Level Security (RLS) Policies
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_hourly ENABLE ROW LEVEL SECURITY;

-- Example RLS Policies (account-based isolation)
CREATE POLICY "Users can only access their account data" ON accounts
    FOR ALL USING (id = current_setting('app.current_account_id')::uuid);

CREATE POLICY "Users can only access users in their account" ON users
    FOR ALL USING (account_id = current_setting('app.current_account_id')::uuid);

CREATE POLICY "Users can only access flows in their account" ON flows
    FOR ALL USING (account_id = current_setting('app.current_account_id')::uuid);

CREATE POLICY "Users can only access campaigns in their account" ON campaigns
    FOR ALL USING (account_id = current_setting('app.current_account_id')::uuid);

CREATE POLICY "Users can only access leads in their account" ON leads
    FOR ALL USING (account_id = current_setting('app.current_account_id')::uuid);

CREATE POLICY "Users can only access call sessions in their account" ON call_sessions
    FOR ALL USING (account_id = current_setting('app.current_account_id')::uuid);

-- Functions for common operations
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Auto-update triggers
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_flows_updated_at BEFORE UPDATE ON flows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_call_sessions_updated_at BEFORE UPDATE ON call_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Utility functions
CREATE OR REPLACE FUNCTION generate_campaign_analytics(
    p_account_id UUID,
    p_campaign_id UUID,
    p_start_date DATE,
    p_end_date DATE
) RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_calls', COUNT(*),
        'connected_calls', COUNT(*) FILTER (WHERE status = 'completed' AND disposition = 'connected'),
        'connection_rate', ROUND(
            (COUNT(*) FILTER (WHERE status = 'completed' AND disposition = 'connected')::float / 
             NULLIF(COUNT(*), 0) * 100), 2
        ),
        'average_duration', ROUND(AVG(duration) FILTER (WHERE duration > 0), 0),
        'total_cost', SUM(cost_cents) / 100.0
    ) INTO result
    FROM call_sessions
    WHERE account_id = p_account_id 
    AND (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
    AND DATE(created_at) BETWEEN p_start_date AND p_end_date;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Seed some initial data
INSERT INTO accounts (name, slug, plan_type) VALUES 
('Demo Account', 'demo', 'professional');

-- Get the demo account ID for other inserts
DO $$
DECLARE
    demo_account_id UUID;
BEGIN
    SELECT id INTO demo_account_id FROM accounts WHERE slug = 'demo';
    
    -- Insert demo flow
    INSERT INTO flows (account_id, name, description, flow_json, status) VALUES 
    (demo_account_id, 'Customer Service Flow', 'Basic customer service flow with routing', 
     '{"nodes": [], "edges": []}', 'published');
END $$;
