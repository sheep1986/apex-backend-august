-- Add VAPI credential columns to organizations table
-- This allows each organization to store their own VAPI API credentials

ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS vapi_api_key TEXT,
ADD COLUMN IF NOT EXISTS vapi_assistant_id TEXT,
ADD COLUMN IF NOT EXISTS vapi_phone_number_id TEXT,
ADD COLUMN IF NOT EXISTS vapi_webhook_url TEXT,
ADD COLUMN IF NOT EXISTS vapi_settings JSONB DEFAULT '{}'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN organizations.vapi_api_key IS 'Organization-specific VAPI API key for outbound calls';
COMMENT ON COLUMN organizations.vapi_assistant_id IS 'Default VAPI assistant ID for this organization';
COMMENT ON COLUMN organizations.vapi_phone_number_id IS 'Default VAPI phone number ID for this organization';
COMMENT ON COLUMN organizations.vapi_webhook_url IS 'Organization-specific webhook URL for VAPI callbacks';
COMMENT ON COLUMN organizations.vapi_settings IS 'Additional VAPI configuration settings (JSON)';

-- Create index for faster lookups by VAPI assistant ID
CREATE INDEX IF NOT EXISTS idx_organizations_vapi_assistant ON organizations(vapi_assistant_id);
CREATE INDEX IF NOT EXISTS idx_organizations_vapi_phone ON organizations(vapi_phone_number_id); 