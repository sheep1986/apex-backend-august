-- Comprehensive Database Fix for Apex AI Calling Platform
-- This script fixes all schema issues and prepares the database for production

-- 1. Fix user roles constraint
DO $$ 
BEGIN
    -- Drop existing constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage 
        WHERE constraint_name = 'users_role_check'
    ) THEN
        ALTER TABLE users DROP CONSTRAINT users_role_check;
    END IF;
    
    -- Add correct constraint with all valid roles
    ALTER TABLE users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('platform_owner', 'support_admin', 'support_agent', 'client_admin', 'client_user', 'agency_owner', 'agency_admin', 'agency_user', 'agent'));
END $$;

-- 2. Add missing columns to users table if they don't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS clerk_user_id VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS verification_required BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS invitation_accepted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;

-- 3. Add missing columns to organizations table if they don't exist
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'client' CHECK (type IN ('platform', 'client')),
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS parent_organization_id UUID REFERENCES organizations(id),
ADD COLUMN IF NOT EXISTS clerk_organization_id VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'starter',
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'active',
ADD COLUMN IF NOT EXISTS credits_balance INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS monthly_spend DECIMAL(10,2) DEFAULT 0;

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(type);
CREATE INDEX IF NOT EXISTS idx_organizations_owner_id ON organizations(owner_id);

-- 5. Insert default platform organization if it doesn't exist
INSERT INTO organizations (id, name, type, settings, is_active, created_at, updated_at)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'Apex Platform Team',
  'platform',
  '{"isPlatformOrg": true, "features": ["all"]}',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT (id) DO UPDATE SET 
  type = 'platform',
  settings = '{"isPlatformOrg": true, "features": ["all"]}',
  updated_at = CURRENT_TIMESTAMP;

-- 6. Update existing platform owner user permissions
UPDATE users 
SET permissions = jsonb_build_object(
  'canAccessAllOrganizations', true,
  'canManageClients', true,
  'canViewClientData', true,
  'canManageTeam', true,
  'isSuperAdmin', true,
  'isPlatformOwner', true
),
settings = jsonb_build_object(
  'theme', 'dark',
  'notifications', true,
  'emailNotifications', true
),
organization_id = '550e8400-e29b-41d4-a716-446655440000',
updated_at = CURRENT_TIMESTAMP
WHERE role = 'platform_owner';

-- 7. Create leads table if it doesn't exist
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    
    -- Contact Information
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    company VARCHAR(255),
    title VARCHAR(255),
    
    -- Lead Status
    status VARCHAR(50) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'interested', 'not_interested', 'callback', 'converted', 'do_not_call')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    source VARCHAR(100),
    
    -- Custom Fields
    custom_fields JSONB DEFAULT '{}',
    tags TEXT[],
    notes TEXT,
    
    -- Tracking
    last_contacted TIMESTAMP WITH TIME ZONE,
    next_follow_up TIMESTAMP WITH TIME ZONE,
    assigned_to UUID REFERENCES users(id),
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_leads_organization_id (organization_id),
    INDEX idx_leads_status (status),
    INDEX idx_leads_email (email),
    INDEX idx_leads_phone (phone)
);

-- 8. Create campaigns table if it doesn't exist
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Campaign Details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) DEFAULT 'outbound' CHECK (type IN ('outbound', 'inbound', 'mixed')),
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
    
    -- Configuration
    script TEXT,
    voice_settings JSONB DEFAULT '{}',
    schedule JSONB DEFAULT '{}',
    
    -- Budget and Limits
    budget_total DECIMAL(10,2),
    budget_spent DECIMAL(10,2) DEFAULT 0,
    daily_limit INTEGER,
    
    -- Performance Metrics
    total_calls INTEGER DEFAULT 0,
    connected_calls INTEGER DEFAULT 0,
    conversion_rate DECIMAL(5,2) DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    
    -- Indexes
    INDEX idx_campaigns_organization_id (organization_id),
    INDEX idx_campaigns_status (status),
    INDEX idx_campaigns_created_by (created_by)
);

-- 9. Create call_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    
    -- Call Details
    phone_number VARCHAR(50) NOT NULL,
    direction VARCHAR(20) DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
    status VARCHAR(50) DEFAULT 'initiated' CHECK (status IN ('initiated', 'ringing', 'answered', 'completed', 'failed', 'no_answer', 'busy')),
    
    -- Call Metrics
    duration INTEGER DEFAULT 0, -- in seconds
    cost DECIMAL(10,4) DEFAULT 0,
    
    -- VAPI Integration
    vapi_call_id VARCHAR(255),
    recording_url TEXT,
    transcript TEXT,
    
    -- AI Analysis
    sentiment VARCHAR(50),
    summary TEXT,
    outcome VARCHAR(100),
    
    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    INDEX idx_call_logs_organization_id (organization_id),
    INDEX idx_call_logs_campaign_id (campaign_id),
    INDEX idx_call_logs_lead_id (lead_id),
    INDEX idx_call_logs_started_at (started_at),
    INDEX idx_call_logs_vapi_call_id (vapi_call_id)
);

-- 10. Enable Row Level Security
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;

-- 11. Create RLS policies for multi-tenant isolation

-- Platform team can see everything
CREATE POLICY IF NOT EXISTS "platform_team_all_access" ON organizations
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.role = 'platform_owner'
        AND users.permissions->>'canAccessAllOrganizations' = 'true'
    )
);

-- Users can see their own organization
CREATE POLICY IF NOT EXISTS "users_own_organization" ON organizations
FOR SELECT USING (
    id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
    )
);

-- Similar policies for other tables
CREATE POLICY IF NOT EXISTS "platform_team_all_users" ON users
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM users u 
        WHERE u.id = auth.uid() 
        AND u.role = 'platform_owner'
        AND u.permissions->>'canAccessAllOrganizations' = 'true'
    )
);

CREATE POLICY IF NOT EXISTS "users_same_organization" ON users
FOR SELECT USING (
    organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
    )
);

-- 12. Create helper functions

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at 
    BEFORE UPDATE ON organizations 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at 
    BEFORE UPDATE ON leads 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_campaigns_updated_at ON campaigns;
CREATE TRIGGER update_campaigns_updated_at 
    BEFORE UPDATE ON campaigns 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 13. Insert sample data for testing (only if tables are empty)
DO $$
BEGIN
    -- Only insert if no users exist
    IF NOT EXISTS (SELECT 1 FROM users LIMIT 1) THEN
        -- Insert platform owner
        INSERT INTO users (
            id, email, first_name, last_name, role, organization_id, 
            permissions, settings, is_active, created_at, updated_at
        ) VALUES (
            gen_random_uuid(),
            'sean@apex.ai',
            'Sean',
            'Wentz',
            'platform_owner',
            '550e8400-e29b-41d4-a716-446655440000',
            '{"canAccessAllOrganizations": true, "canManageClients": true, "isSuperAdmin": true}',
            '{"theme": "dark", "notifications": true}',
            true,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        );
    END IF;
END $$;

-- 14. Refresh statistics
ANALYZE users;
ANALYZE organizations;
ANALYZE leads;
ANALYZE campaigns;
ANALYZE call_logs;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Database schema has been successfully updated and fixed!';
    RAISE NOTICE 'All tables, indexes, and constraints are now properly configured.';
    RAISE NOTICE 'Row Level Security is enabled for multi-tenant isolation.';
END $$; 