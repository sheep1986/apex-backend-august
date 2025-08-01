-- Multi-Tenant Schema Updates for Apex AI Platform
-- Run this in your Supabase SQL editor

-- 1. Update organizations table to support types
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'client' CHECK (type IN ('platform', 'client')),
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS parent_organization_id UUID REFERENCES organizations(id),
ADD COLUMN IF NOT EXISTS clerk_organization_id VARCHAR(255) UNIQUE;

-- 2. Update users table for better role management and permissions
ALTER TABLE users
ADD COLUMN IF NOT EXISTS clerk_user_id VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS verification_required BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS invitation_accepted_at TIMESTAMP WITH TIME ZONE;

-- Update role check constraint to include new roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check 
CHECK (role IN ('platform_owner', 'support_admin', 'support_agent', 'client_admin', 'client_user'));

-- 3. Create verification codes table
CREATE TABLE IF NOT EXISTS verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(6) NOT NULL,
  method VARCHAR(10) CHECK (method IN ('email', 'sms')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Index for quick lookups
  INDEX idx_verification_codes_user_id (user_id),
  INDEX idx_verification_codes_code (code),
  INDEX idx_verification_codes_expires (expires_at)
);

-- 4. Create audit logs table for tracking organization switches
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  target_id UUID,
  target_type VARCHAR(50),
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes for querying
  INDEX idx_audit_logs_user_id (user_id),
  INDEX idx_audit_logs_action (action),
  INDEX idx_audit_logs_created_at (created_at)
);

-- 5. Create organization memberships table (for complex permissions)
CREATE TABLE IF NOT EXISTS organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  permissions JSONB DEFAULT '{}',
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Ensure unique membership
  UNIQUE(user_id, organization_id),
  
  -- Indexes
  INDEX idx_memberships_user_id (user_id),
  INDEX idx_memberships_org_id (organization_id)
);

-- 6. Create RLS policies for multi-tenant isolation

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;

-- Organizations policies
CREATE POLICY "Platform team can see all organizations" ON organizations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.permissions->>'canAccessAllOrganizations' = 'true'
    )
  );

CREATE POLICY "Users can see their own organization" ON organizations
  FOR SELECT USING (
    id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid()
    )
  );

-- Users policies
CREATE POLICY "Platform team can see all users" ON users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u 
      WHERE u.id = auth.uid() 
      AND u.permissions->>'canAccessAllOrganizations' = 'true'
    )
  );

CREATE POLICY "Users can see users in their organization" ON users
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid()
    )
  );

-- Leads policies (client data isolation)
CREATE POLICY "Platform team can see all leads when in support mode" ON leads
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.permissions->>'canAccessAllOrganizations' = 'true'
    )
  );

CREATE POLICY "Users can only see their organization's leads" ON leads
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
      UNION
      SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid()
    )
  );

-- 7. Create helper functions

-- Function to check if user can access organization
CREATE OR REPLACE FUNCTION can_access_organization(user_id UUID, org_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  has_access BOOLEAN;
BEGIN
  SELECT EXISTS (
    -- User's primary organization
    SELECT 1 FROM users WHERE id = user_id AND organization_id = org_id
    UNION
    -- User has membership in organization
    SELECT 1 FROM organization_memberships WHERE user_id = user_id AND organization_id = org_id
    UNION
    -- User has platform access (support team)
    SELECT 1 FROM users 
    WHERE id = user_id 
    AND permissions->>'canAccessAllOrganizations' = 'true'
  ) INTO has_access;
  
  RETURN has_access;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to log organization access
CREATE OR REPLACE FUNCTION log_organization_access()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'SELECT' AND 
     EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND permissions->>'canAccessAllOrganizations' = 'true') AND
     NEW.organization_id != (SELECT organization_id FROM users WHERE id = auth.uid()) THEN
    
    INSERT INTO audit_logs (user_id, action, target_id, target_type, metadata)
    VALUES (
      auth.uid(),
      'organization_access',
      NEW.organization_id,
      TG_TABLE_NAME,
      jsonb_build_object(
        'accessed_at', CURRENT_TIMESTAMP,
        'table', TG_TABLE_NAME
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Insert default platform organization
INSERT INTO organizations (id, name, type, settings, is_active)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'Apex Platform Team',
  'platform',
  '{"isPlatformOrg": true}',
  true
) ON CONFLICT (id) DO UPDATE SET type = 'platform';

-- 9. Update existing platform owner user permissions
UPDATE users 
SET permissions = jsonb_build_object(
  'canAccessAllOrganizations', true,
  'canManageClients', true,
  'canViewClientData', true,
  'canManageTeam', true,
  'isSuperAdmin', true
)
WHERE role = 'platform_owner';

-- 10. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_users_permissions ON users USING GIN(permissions);
CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(type);
CREATE INDEX IF NOT EXISTS idx_organizations_clerk_org_id ON organizations(clerk_organization_id); 