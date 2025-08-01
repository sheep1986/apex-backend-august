-- Campaign Team Members Database Schema
-- Comprehensive team member system with CRM lead access

-- Campaign Team Members table
CREATE TABLE IF NOT EXISTS campaign_team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL, -- References campaigns.id
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL, -- For invites before user exists
    role VARCHAR(50) DEFAULT 'member', -- owner, manager, agent, viewer
    status VARCHAR(20) DEFAULT 'active', -- active, pending, declined
    permissions JSONB DEFAULT '{}', -- CRM and campaign permissions
    crm_access_level VARCHAR(50) DEFAULT 'campaign_leads', -- all_leads, campaign_leads, assigned_leads, no_access
    lead_permissions JSONB DEFAULT '{"view": true, "edit": false, "delete": false, "export": false}',
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(campaign_id, email)
);

-- Campaign Team Invitations table
CREATE TABLE IF NOT EXISTS campaign_team_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL, -- References campaigns.id
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'member',
    permissions JSONB DEFAULT '{}',
    crm_access_level VARCHAR(50) DEFAULT 'campaign_leads',
    lead_permissions JSONB DEFAULT '{"view": true, "edit": false, "delete": false, "export": false}',
    invitation_token VARCHAR(255) UNIQUE NOT NULL,
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
    status VARCHAR(20) DEFAULT 'pending', -- pending, accepted, declined, expired
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP
);

-- Lead Assignments table - for assigning specific leads to team members
CREATE TABLE IF NOT EXISTS lead_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL, -- References leads/contacts table
    campaign_id UUID NOT NULL, -- References campaigns.id
    assigned_to UUID REFERENCES users(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    assignment_type VARCHAR(50) DEFAULT 'manual', -- manual, auto, round_robin
    status VARCHAR(50) DEFAULT 'active', -- active, completed, reassigned
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(lead_id, campaign_id, assigned_to)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaign_team_members_campaign_id ON campaign_team_members(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_team_members_user_id ON campaign_team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_team_members_email ON campaign_team_members(email);
CREATE INDEX IF NOT EXISTS idx_campaign_team_invitations_campaign_id ON campaign_team_invitations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_team_invitations_token ON campaign_team_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_campaign_team_invitations_email ON campaign_team_invitations(email);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_lead_id ON lead_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_campaign_id ON lead_assignments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_lead_assignments_assigned_to ON lead_assignments(assigned_to);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at columns
CREATE TRIGGER update_campaign_team_members_updated_at 
    BEFORE UPDATE ON campaign_team_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lead_assignments_updated_at 
    BEFORE UPDATE ON lead_assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create views for easy querying
CREATE OR REPLACE VIEW campaign_team_members_with_details AS
SELECT 
    ctm.id,
    ctm.campaign_id,
    ctm.user_id,
    ctm.email,
    ctm.role,
    ctm.status,
    ctm.permissions,
    ctm.crm_access_level,
    ctm.lead_permissions,
    ctm.joined_at,
    u.first_name,
    u.last_name,
    u.avatar_url,
    u.clerk_user_id,
    invited_by_user.first_name as invited_by_first_name,
    invited_by_user.last_name as invited_by_last_name
FROM campaign_team_members ctm
LEFT JOIN users u ON ctm.user_id = u.id
LEFT JOIN users invited_by_user ON ctm.invited_by = invited_by_user.id;

-- View for lead assignments with member details
CREATE OR REPLACE VIEW lead_assignments_with_details AS
SELECT 
    la.id,
    la.lead_id,
    la.campaign_id,
    la.assigned_to,
    la.assigned_by,
    la.assignment_type,
    la.status,
    la.notes,
    la.created_at,
    assigned_user.first_name as assigned_user_first_name,
    assigned_user.last_name as assigned_user_last_name,
    assigned_user.email as assigned_user_email,
    assigner_user.first_name as assigner_first_name,
    assigner_user.last_name as assigner_last_name
FROM lead_assignments la
LEFT JOIN users assigned_user ON la.assigned_to = assigned_user.id
LEFT JOIN users assigner_user ON la.assigned_by = assigner_user.id;

-- Add some sample data for testing (remove in production)
-- INSERT INTO campaign_team_members (campaign_id, email, role, status) VALUES
-- ('550e8400-e29b-41d4-a716-446655440000', 'admin@example.com', 'owner', 'active'),
-- ('550e8400-e29b-41d4-a716-446655440000', 'manager@example.com', 'manager', 'active'),
-- ('550e8400-e29b-41d4-a716-446655440000', 'agent@example.com', 'member', 'pending');

COMMENT ON TABLE campaign_team_members IS 'Team members assigned to campaigns with CRM lead access privileges';
COMMENT ON TABLE campaign_team_invitations IS 'Pending invitations for campaign team membership with CRM permissions';
COMMENT ON TABLE lead_assignments IS 'Individual lead assignments to team members for targeted follow-up';
COMMENT ON COLUMN campaign_team_members.role IS 'Campaign role: owner, manager, agent, viewer';
COMMENT ON COLUMN campaign_team_members.permissions IS 'JSON object with campaign-specific permissions';
COMMENT ON COLUMN campaign_team_members.crm_access_level IS 'CRM access level: all_leads, campaign_leads, assigned_leads, no_access';
COMMENT ON COLUMN campaign_team_members.lead_permissions IS 'JSON object with lead management permissions (view, edit, delete, export)';
COMMENT ON COLUMN lead_assignments.assignment_type IS 'How lead was assigned: manual, auto, round_robin';