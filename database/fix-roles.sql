-- Fix user roles in the database
-- This updates the existing schema.sql roles to match the multi-tenant roles

-- First, update the user_role enum type
ALTER TYPE user_role RENAME TO user_role_old;

CREATE TYPE user_role AS ENUM ('platform_owner', 'support_admin', 'support_agent', 'client_admin', 'client_user');

-- Update the users table to use the new enum
ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::text::user_role;

-- Drop the old enum
DROP TYPE user_role_old;

-- Add missing columns from multi-tenant schema
ALTER TABLE users
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS verification_required BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS invitation_accepted_at TIMESTAMP WITH TIME ZONE;

-- Update organizations table
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'client' CHECK (type IN ('platform', 'client')),
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS parent_organization_id UUID REFERENCES organizations(id),
ADD COLUMN IF NOT EXISTS clerk_organization_id VARCHAR(255) UNIQUE;

-- Insert default platform organization if it doesn't exist
INSERT INTO organizations (id, name, type, settings, is_active)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  'Apex Platform Team',
  'platform',
  '{"isPlatformOrg": true}',
  true
) ON CONFLICT (id) DO UPDATE SET type = 'platform'; 