-- Add VAPI settings columns to organizations table
-- This allows storing VAPI credentials directly in the organizations table

ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS vapi_settings JSONB DEFAULT '{}';

-- Add a general settings column for future use
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- Add individual VAPI columns for better query performance
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS vapi_api_key VARCHAR(255),
ADD COLUMN IF NOT EXISTS vapi_private_key VARCHAR(255),
ADD COLUMN IF NOT EXISTS vapi_webhook_url VARCHAR(255) DEFAULT 'https://api.apexai.com/webhooks/vapi';

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_organizations_vapi_settings 
ON organizations USING GIN (vapi_settings);

CREATE INDEX IF NOT EXISTS idx_organizations_settings 
ON organizations USING GIN (settings);

-- Add comments for documentation
COMMENT ON COLUMN organizations.vapi_settings IS 'JSONB storage for VAPI configuration and credentials';
COMMENT ON COLUMN organizations.settings IS 'General JSONB storage for organization settings';
COMMENT ON COLUMN organizations.vapi_api_key IS 'VAPI API key for authentication';
COMMENT ON COLUMN organizations.vapi_private_key IS 'VAPI private key for authentication';
COMMENT ON COLUMN organizations.vapi_webhook_url IS 'VAPI webhook URL for callbacks';

-- Update the updated_at timestamp to refresh schema cache
UPDATE organizations SET updated_at = NOW() WHERE 1=1; 