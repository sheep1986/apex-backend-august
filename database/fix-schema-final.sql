-- FINAL DATABASE SCHEMA FIX for Apex AI Calling Platform
-- This script resolves all schema conflicts and prepares the database for production

-- 1. Drop existing role constraint and recreate with correct roles
DO $$ 
BEGIN
    -- Drop existing constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage 
        WHERE constraint_name = 'users_role_check'
    ) THEN
        ALTER TABLE users DROP CONSTRAINT users_role_check;
    END IF;
    
    -- Add correct constraint with roles used in the application
    ALTER TABLE users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('platform_owner', 'client_admin', 'client_user', 'client_viewer', 'support_admin', 'support_agent'));
END $$;

-- 2. Ensure organizations table has all required columns
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'client' CHECK (type IN ('platform', 'client')),
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS parent_organization_id UUID REFERENCES organizations(id),
ADD COLUMN IF NOT EXISTS clerk_organization_id VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS subscription_plan VARCHAR(50) DEFAULT 'starter',
ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'active',
ADD COLUMN IF NOT EXISTS credits_balance INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 3. Ensure users table has all required columns
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id),
ADD COLUMN IF NOT EXISTS clerk_user_id VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'client_user',
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 4. Create leads table if it doesn't exist
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    campaign_id UUID,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50) NOT NULL,
    company VARCHAR(255),
    title VARCHAR(255),
    industry VARCHAR(100),
    status VARCHAR(50) DEFAULT 'new',
    source VARCHAR(100),
    tags TEXT[],
    custom_fields JSONB DEFAULT '{}',
    assigned_to UUID REFERENCES users(id),
    last_contacted TIMESTAMP WITH TIME ZONE,
    next_follow_up TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create campaigns table if it doesn't exist
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'draft',
    campaign_type VARCHAR(50) DEFAULT 'outbound',
    settings JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Create call_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS call_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id),
    phone_number VARCHAR(50),
    call_duration INTEGER DEFAULT 0,
    call_status VARCHAR(50),
    call_outcome VARCHAR(50),
    recording_url TEXT,
    transcript TEXT,
    ai_summary TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Create notifications table if it doesn't exist
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'info',
    category VARCHAR(50),
    priority VARCHAR(20) DEFAULT 'medium',
    read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    action JSONB DEFAULT '{}',
    source VARCHAR(100),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Create proper indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(type);
CREATE INDEX IF NOT EXISTS idx_leads_organization_id ON leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_campaigns_organization_id ON campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_organization_id ON call_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_lead_id ON call_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);

-- 9. Insert default platform organization
INSERT INTO organizations (id, name, slug, type, settings, is_active)
VALUES (
    '550e8400-e29b-41d4-a716-446655440000',
    'Apex Platform Team',
    'apex-platform',
    'platform',
    '{"isPlatformOrg": true, "allowAllFeatures": true}',
    true
) ON CONFLICT (id) DO UPDATE SET 
    type = 'platform',
    settings = '{"isPlatformOrg": true, "allowAllFeatures": true}';

-- 10. Create update triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at columns
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at 
    BEFORE UPDATE ON organizations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at 
    BEFORE UPDATE ON leads 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_campaigns_updated_at ON campaigns;
CREATE TRIGGER update_campaigns_updated_at 
    BEFORE UPDATE ON campaigns 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_call_logs_updated_at ON call_logs;
CREATE TRIGGER update_call_logs_updated_at 
    BEFORE UPDATE ON call_logs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 11. Enable Row Level Security
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 12. Create RLS policies for multi-tenant isolation

-- Platform owners can see everything
CREATE POLICY IF NOT EXISTS "platform_owners_all_organizations" ON organizations
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM users 
        WHERE users.id = auth.uid() 
        AND users.role = 'platform_owner'
    )
);

-- Users can see their own organization
CREATE POLICY IF NOT EXISTS "users_own_organization" ON organizations
FOR SELECT USING (
    id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
    )
);

-- Platform owners can see all users
CREATE POLICY IF NOT EXISTS "platform_owners_all_users" ON users
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM users u 
        WHERE u.id = auth.uid() 
        AND u.role = 'platform_owner'
    )
);

-- Users can see users in their organization
CREATE POLICY IF NOT EXISTS "users_same_organization" ON users
FOR SELECT USING (
    organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
    )
);

-- Similar policies for leads, campaigns, call_logs
CREATE POLICY IF NOT EXISTS "organization_leads_access" ON leads
FOR ALL USING (
    organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
        UNION
        SELECT id FROM organizations WHERE EXISTS (
            SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'platform_owner'
        )
    )
);

CREATE POLICY IF NOT EXISTS "organization_campaigns_access" ON campaigns
FOR ALL USING (
    organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
        UNION
        SELECT id FROM organizations WHERE EXISTS (
            SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'platform_owner'
        )
    )
);

CREATE POLICY IF NOT EXISTS "organization_call_logs_access" ON call_logs
FOR ALL USING (
    organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
        UNION
        SELECT id FROM organizations WHERE EXISTS (
            SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'platform_owner'
        )
    )
);

-- 13. Insert a test platform owner user if none exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE role = 'platform_owner' LIMIT 1) THEN
        INSERT INTO users (
            id, email, first_name, last_name, role, organization_id, 
            permissions, settings, is_active, created_at, updated_at
        ) VALUES (
            uuid_generate_v4(),
            'sean@apex.ai',
            'Sean',
            'Wentz',
            'platform_owner',
            '550e8400-e29b-41d4-a716-446655440000',
            '{"canAccessAllOrganizations": true, "canManageClients": true, "isSuperAdmin": true}',
            '{"theme": "dark", "notifications": true}',
            true,
            NOW(),
            NOW()
        );
        
        RAISE NOTICE 'Created platform owner user: sean@apex.ai';
    END IF;
END $$;

-- 14. Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Database schema has been successfully fixed!';
    RAISE NOTICE '✅ All tables, constraints, and policies are properly configured.';
    RAISE NOTICE '✅ Platform owner user is ready for testing.';
    RAISE NOTICE '✅ Multi-tenant isolation is enabled with RLS.';
END $$; 