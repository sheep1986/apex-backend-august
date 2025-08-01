-- Teams Management Database Schema
-- Comprehensive role-based access control system

-- Core Users table (extends existing users)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id VARCHAR(255) UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    avatar_url TEXT,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teams table
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    organization_id UUID,
    settings JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Roles table with predefined system roles
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    level INTEGER DEFAULT 0, -- Hierarchy level (higher = more permissions)
    is_system BOOLEAN DEFAULT FALSE, -- System roles cannot be deleted
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Permissions table with granular permissions
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    description TEXT,
    resource VARCHAR(50) NOT NULL, -- campaigns, teams, users, etc.
    action VARCHAR(50) NOT NULL,   -- create, read, update, delete, manage
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Role-Permission junction table
CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(role_id, permission_id)
);

-- Team Members junction table
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE RESTRICT,
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    invitation_status VARCHAR(20) DEFAULT 'active', -- active, pending, declined
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, team_id)
);

-- Team Invitations table
CREATE TABLE team_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    email VARCHAR(255) NOT NULL,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    invitation_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, declined, expired
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP
);

-- Audit Log for team changes
CREATE TABLE team_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL, -- member_added, member_removed, role_changed, etc.
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Campaign Team Access (extends existing campaigns)
CREATE TABLE campaign_team_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL, -- References campaigns.id
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    access_level VARCHAR(20) DEFAULT 'read', -- read, write, manage
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(campaign_id, team_id)
);

-- Insert default system roles
INSERT INTO roles (name, display_name, description, level, is_system) VALUES
('super_admin', 'Super Admin', 'Full system access with all permissions', 100, true),
('admin', 'Administrator', 'Full team and campaign management access', 90, true),
('campaign_manager', 'Campaign Manager', 'Create and manage campaigns, view team performance', 70, true),
('team_lead', 'Team Lead', 'Manage team members and view team analytics', 60, true),
('agent', 'Agent', 'Execute calls, view assigned contacts, submit reports', 40, true),
('viewer', 'Viewer', 'Read-only access to campaigns and basic analytics', 20, true);

-- Insert comprehensive permissions
INSERT INTO permissions (name, display_name, description, resource, action) VALUES
-- Team permissions
('teams.create', 'Create Teams', 'Create new teams', 'teams', 'create'),
('teams.read', 'View Teams', 'View team information', 'teams', 'read'),
('teams.update', 'Edit Teams', 'Edit team settings and information', 'teams', 'update'),
('teams.delete', 'Delete Teams', 'Delete teams', 'teams', 'delete'),
('teams.manage_members', 'Manage Team Members', 'Add, remove, and manage team members', 'teams', 'manage'),

-- User permissions
('users.create', 'Create Users', 'Invite and create new users', 'users', 'create'),
('users.read', 'View Users', 'View user profiles and information', 'users', 'read'),
('users.update', 'Edit Users', 'Edit user profiles and settings', 'users', 'update'),
('users.delete', 'Delete Users', 'Delete user accounts', 'users', 'delete'),

-- Campaign permissions
('campaigns.create', 'Create Campaigns', 'Create new calling campaigns', 'campaigns', 'create'),
('campaigns.read', 'View Campaigns', 'View campaign details and analytics', 'campaigns', 'read'),
('campaigns.update', 'Edit Campaigns', 'Modify campaign settings and configuration', 'campaigns', 'update'),
('campaigns.delete', 'Delete Campaigns', 'Delete campaigns', 'campaigns', 'delete'),
('campaigns.execute', 'Execute Campaigns', 'Start, pause, and control campaign execution', 'campaigns', 'execute'),

-- Call permissions
('calls.read', 'View Calls', 'View call logs and recordings', 'calls', 'read'),
('calls.execute', 'Make Calls', 'Execute outbound calls', 'calls', 'execute'),
('calls.manage', 'Manage Calls', 'Full call management and monitoring', 'calls', 'manage'),

-- Analytics permissions
('analytics.read', 'View Analytics', 'View basic analytics and reports', 'analytics', 'read'),
('analytics.advanced', 'Advanced Analytics', 'View detailed analytics and custom reports', 'analytics', 'advanced'),

-- System permissions
('system.settings', 'System Settings', 'Configure system-wide settings', 'system', 'manage'),
('system.billing', 'Billing Management', 'Manage billing and subscription settings', 'system', 'billing');

-- Assign permissions to roles
-- Super Admin gets all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'super_admin';

-- Admin permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.name = 'admin' AND p.name IN (
    'teams.create', 'teams.read', 'teams.update', 'teams.delete', 'teams.manage_members',
    'users.create', 'users.read', 'users.update', 'users.delete',
    'campaigns.create', 'campaigns.read', 'campaigns.update', 'campaigns.delete', 'campaigns.execute',
    'calls.read', 'calls.execute', 'calls.manage',
    'analytics.read', 'analytics.advanced'
);

-- Campaign Manager permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.name = 'campaign_manager' AND p.name IN (
    'teams.read', 'users.read',
    'campaigns.create', 'campaigns.read', 'campaigns.update', 'campaigns.execute',
    'calls.read', 'calls.execute', 'calls.manage',
    'analytics.read', 'analytics.advanced'
);

-- Team Lead permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.name = 'team_lead' AND p.name IN (
    'teams.read', 'teams.manage_members', 'users.read',
    'campaigns.read', 'campaigns.update', 'campaigns.execute',
    'calls.read', 'calls.execute',
    'analytics.read'
);

-- Agent permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.name = 'agent' AND p.name IN (
    'campaigns.read', 'calls.read', 'calls.execute', 'analytics.read'
);

-- Viewer permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p 
WHERE r.name = 'viewer' AND p.name IN (
    'campaigns.read', 'calls.read', 'analytics.read'
);

-- Create indexes for performance
CREATE INDEX idx_team_members_user_id ON team_members(user_id);
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_role_id ON team_members(role_id);
CREATE INDEX idx_team_invitations_token ON team_invitations(invitation_token);
CREATE INDEX idx_team_invitations_email ON team_invitations(email);
CREATE INDEX idx_team_audit_logs_team_id ON team_audit_logs(team_id);
CREATE INDEX idx_team_audit_logs_created_at ON team_audit_logs(created_at);
CREATE INDEX idx_campaign_team_access_campaign_id ON campaign_team_access(campaign_id);
CREATE INDEX idx_campaign_team_access_team_id ON campaign_team_access(team_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at columns
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_team_members_updated_at BEFORE UPDATE ON team_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create views for easier querying
CREATE VIEW team_members_with_details AS
SELECT 
    tm.id,
    tm.team_id,
    tm.user_id,
    tm.role_id,
    tm.joined_at,
    t.name as team_name,
    u.email,
    u.first_name,
    u.last_name,
    u.avatar_url,
    r.name as role_name,
    r.display_name as role_display_name,
    r.level as role_level
FROM team_members tm
JOIN teams t ON tm.team_id = t.id
JOIN users u ON tm.user_id = u.id
JOIN roles r ON tm.role_id = r.id
WHERE tm.invitation_status = 'active';

CREATE VIEW user_permissions AS
SELECT DISTINCT
    tm.user_id,
    tm.team_id,
    p.name as permission_name,
    p.resource,
    p.action
FROM team_members tm
JOIN role_permissions rp ON tm.role_id = rp.role_id
JOIN permissions p ON rp.permission_id = p.id
WHERE tm.invitation_status = 'active';

COMMENT ON TABLE teams IS 'Teams for organizing users and managing access control';
COMMENT ON TABLE roles IS 'Role definitions with hierarchical permissions';
COMMENT ON TABLE permissions IS 'Granular permissions for system resources';
COMMENT ON TABLE team_members IS 'Junction table linking users to teams with roles';
COMMENT ON TABLE team_invitations IS 'Pending invitations to join teams';
COMMENT ON TABLE team_audit_logs IS 'Audit trail for team-related changes';