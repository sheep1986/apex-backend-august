-- Quick Database Setup for Immediate Testing
-- Run this in your Supabase SQL Editor to get started quickly

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom types for better type safety
CREATE TYPE plan_type AS ENUM ('starter', 'professional', 'enterprise', 'custom');
CREATE TYPE user_role AS ENUM ('admin', 'supervisor', 'agent', 'viewer');
CREATE TYPE campaign_type AS ENUM ('outbound', 'inbound', 'blended');
CREATE TYPE campaign_status AS ENUM ('draft', 'scheduled', 'active', 'paused', 'completed', 'archived');
CREATE TYPE flow_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE call_status AS ENUM ('queued', 'dialing', 'ringing', 'active', 'completed', 'failed', 'cancelled');
CREATE TYPE call_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE call_disposition AS ENUM ('connected', 'no_answer', 'busy', 'voicemail', 'failed', 'cancelled', 'converted');
CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'qualified', 'not_qualified', 'converted', 'do_not_call', 'callback_scheduled', 'voicemail_left', 'busy', 'no_answer', 'failed');

-- Core Authentication & Account Management
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan_type plan_type DEFAULT 'starter',
    billing_email VARCHAR(255),
    settings JSONB DEFAULT '{}',
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
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Campaign Management
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type campaign_type DEFAULT 'outbound',
    status campaign_status DEFAULT 'draft',
    settings JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lead Management
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    company VARCHAR(255),
    status lead_status DEFAULT 'new',
    custom_fields JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Call Session Management
CREATE TABLE call_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    assigned_agent_id UUID REFERENCES users(id),
    twilio_call_sid VARCHAR(255) UNIQUE,
    status call_status DEFAULT 'queued',
    direction call_direction DEFAULT 'outbound',
    duration INTEGER DEFAULT 0,
    disposition call_disposition,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Essential Indexes
CREATE INDEX idx_accounts_slug ON accounts(slug);
CREATE INDEX idx_users_clerk_id ON users(clerk_user_id);
CREATE INDEX idx_users_account_role ON users(account_id, role);
CREATE INDEX idx_campaigns_account_status ON campaigns(account_id, status);
CREATE INDEX idx_leads_campaign_status ON leads(campaign_id, status);
CREATE INDEX idx_call_sessions_account_status ON call_sessions(account_id, status);

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

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_call_sessions_updated_at BEFORE UPDATE ON call_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert demo data for immediate testing
INSERT INTO accounts (name, slug, plan_type, billing_email) VALUES 
('Demo Account', 'demo', 'professional', 'demo@apex.ai');

-- Insert demo user with placeholder Clerk ID
INSERT INTO users (account_id, clerk_user_id, email, first_name, last_name, role) VALUES 
(
    (SELECT id FROM accounts WHERE slug = 'demo'),
    'demo_user_placeholder', -- You can update this later with your real Clerk User ID
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
    'Demo campaign for testing the Apex AI Calling Platform',
    'outbound',
    'draft',
    (SELECT id FROM users WHERE email = 'demo@apex.ai')
);

-- Insert sample leads
INSERT INTO leads (account_id, campaign_id, phone_number, first_name, last_name, email, company, status) VALUES 
(
    (SELECT id FROM accounts WHERE slug = 'demo'),
    (SELECT id FROM campaigns WHERE name = 'Demo Campaign'),
    '+1234567890',
    'John',
    'Doe',
    'john.doe@example.com',
    'Example Corp',
    'new'
),
(
    (SELECT id FROM accounts WHERE slug = 'demo'),
    (SELECT id FROM campaigns WHERE name = 'Demo Campaign'),
    '+1987654321',
    'Jane',
    'Smith',
    'jane.smith@example.com',
    'Test Industries',
    'new'
);

-- Success message
SELECT 'Quick database setup completed successfully!' as message,
       'You can now test your API endpoints with demo data' as note,
       'Remember to update the Clerk user ID later when you set up authentication' as reminder; 