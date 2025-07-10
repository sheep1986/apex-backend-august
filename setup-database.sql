-- AI Calling SaaS Platform - Complete Database Setup
-- Run this script in your Supabase SQL Editor

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

-- Lead Import Tables
CREATE TABLE lead_imports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    filename VARCHAR(255),
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported_rows INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    error_details JSONB DEFAULT '[]',
    warning_details JSONB DEFAULT '[]',
    import_settings JSONB DEFAULT '{}',
    file_size_bytes INTEGER,
    processing_time_ms INTEGER,
    created_by UUID REFERENCES users(id),
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
    duration INTEGER DEFAULT 0,
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
    quality_score INTEGER,
    compliance_data JSONB DEFAULT '{}',
    scheduled_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    connected_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Essential Indexes
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
CREATE INDEX idx_lead_imports_account_status ON lead_imports(account_id, status);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
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

CREATE TRIGGER update_lead_imports_updated_at BEFORE UPDATE ON lead_imports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert demo account and user
INSERT INTO accounts (name, slug, plan_type, billing_email) VALUES 
('Demo Account', 'demo', 'professional', 'demo@apex.ai');

-- Insert demo user (you'll need to replace the clerk_user_id with your actual Clerk user ID)
INSERT INTO users (account_id, clerk_user_id, email, first_name, last_name, role) VALUES 
(
    (SELECT id FROM accounts WHERE slug = 'demo'),
    'demo_user_id_replace_me', -- Replace with your actual Clerk user ID
    'demo@apex.ai',
    'Demo',
    'User',
    'admin'
);

-- Insert demo campaign
INSERT INTO campaigns (account_id, name, description, type, status, created_by) VALUES 
(
    (SELECT id FROM accounts WHERE slug = 'demo'),
    'Demo Campaign',
    'Demo campaign for testing',
    'outbound',
    'draft',
    (SELECT id FROM users WHERE email = 'demo@apex.ai')
);

-- Success message
SELECT 'Database setup completed successfully!' as message; 