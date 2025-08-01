-- Email verification table for organization setup
CREATE TABLE IF NOT EXISTS email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON email_verifications(token);
CREATE INDEX IF NOT EXISTS idx_email_verifications_organization_id ON email_verifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_expires_at ON email_verifications(expires_at);

-- Add email verification fields to organizations table
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS team_size VARCHAR(10);

-- Update organizations table status enum to include pending_verification
ALTER TABLE organizations 
DROP CONSTRAINT IF EXISTS organizations_status_check;

ALTER TABLE organizations 
ADD CONSTRAINT organizations_status_check 
CHECK (status IN ('active', 'inactive', 'suspended', 'pending_verification'));

-- Add VAPI fields to organizations table
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS vapi_api_key TEXT,
ADD COLUMN IF NOT EXISTS vapi_private_key TEXT,
ADD COLUMN IF NOT EXISTS country VARCHAR(100),
ADD COLUMN IF NOT EXISTS website TEXT,
ADD COLUMN IF NOT EXISTS industry VARCHAR(100); 