-- VAPI Key Management Migration (Fixed for existing schema)
-- Execute this entire script in Supabase SQL Editor

-- Step 1: Add new vapi_public_key column if it doesn't exist
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS vapi_public_key TEXT;

-- Step 2: Copy existing vapi_api_key data to vapi_public_key
UPDATE organizations 
SET vapi_public_key = vapi_api_key 
WHERE vapi_api_key IS NOT NULL 
  AND vapi_public_key IS NULL;

-- Step 3: Add comments to document the columns
COMMENT ON COLUMN organizations.vapi_api_key IS 'DEPRECATED: Use vapi_public_key instead. Kept for backward compatibility.';
COMMENT ON COLUMN organizations.vapi_public_key IS 'VAPI public key used for webhook signature verification';
COMMENT ON COLUMN organizations.vapi_private_key IS 'VAPI private key used for API authentication - should never be exposed to non-admin users';

-- Step 4: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_organizations_vapi_public_key 
ON organizations(vapi_public_key) 
WHERE vapi_public_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_vapi_private_key 
ON organizations(vapi_private_key) 
WHERE vapi_private_key IS NOT NULL;

-- Step 5: Create audit table for tracking key changes
CREATE TABLE IF NOT EXISTS vapi_key_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES users(id),
  change_type TEXT NOT NULL CHECK (change_type IN ('CREATE', 'UPDATE', 'DELETE')),
  field_changed TEXT CHECK (field_changed IN ('vapi_public_key', 'vapi_private_key', 'both')),
  old_value_hash TEXT,
  new_value_hash TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for audit table
CREATE INDEX IF NOT EXISTS idx_vapi_key_audit_organization 
ON vapi_key_audit(organization_id);

CREATE INDEX IF NOT EXISTS idx_vapi_key_audit_created_at 
ON vapi_key_audit(created_at);

-- Step 6: Create webhook_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_type TEXT NOT NULL,
  event_id TEXT,
  event_type TEXT,
  request_body JSONB,
  response_body JSONB,
  response_status INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_type ON webhook_logs(webhook_type);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at);

-- Step 7: Create vapi_assistants table if it doesn't exist
CREATE TABLE IF NOT EXISTS vapi_assistants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vapi_assistant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'outbound',
  config JSONB,
  voice_id TEXT,
  first_message TEXT,
  system_prompt TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, vapi_assistant_id)
);

CREATE INDEX IF NOT EXISTS idx_vapi_assistants_organization ON vapi_assistants(organization_id);
CREATE INDEX IF NOT EXISTS idx_vapi_assistants_active ON vapi_assistants(is_active);

-- Step 8: Add provider columns to phone_numbers if they don't exist
ALTER TABLE phone_numbers 
ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'twilio';

ALTER TABLE phone_numbers 
ADD COLUMN IF NOT EXISTS provider_id TEXT;

ALTER TABLE phone_numbers 
ADD COLUMN IF NOT EXISTS capabilities TEXT[];

ALTER TABLE phone_numbers 
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add is_active column if it doesn't exist
ALTER TABLE phone_numbers
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create index for provider lookups
CREATE INDEX IF NOT EXISTS idx_phone_numbers_provider 
ON phone_numbers(organization_id, provider);

-- Step 9: Enable RLS on new tables
ALTER TABLE vapi_key_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vapi_assistants ENABLE ROW LEVEL SECURITY;

-- Step 10: Create basic RLS policies for new tables
-- Audit table - only admins can view
CREATE POLICY "vapi_audit_admin_only" ON vapi_key_audit
FOR ALL USING (
  organization_id IN (
    SELECT organization_id FROM users 
    WHERE id = auth.uid() 
    AND role IN ('platform_owner', 'client_admin')
  )
);

-- Webhook logs - organization members can view
CREATE POLICY "webhook_logs_org_access" ON webhook_logs
FOR SELECT USING (true); -- Adjust based on your needs

-- VAPI assistants - organization members can view
CREATE POLICY "vapi_assistants_org_access" ON vapi_assistants
FOR ALL USING (
  organization_id IN (
    SELECT organization_id FROM users 
    WHERE id = auth.uid()
  )
);

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Migration completed successfully!';
  RAISE NOTICE '📊 Changes applied:';
  RAISE NOTICE '  - Added vapi_public_key column to organizations';
  RAISE NOTICE '  - Created vapi_key_audit table for tracking changes';
  RAISE NOTICE '  - Created webhook_logs table for webhook events';
  RAISE NOTICE '  - Created vapi_assistants table for assistant configs';
  RAISE NOTICE '  - Added provider columns to phone_numbers';
  RAISE NOTICE '  - Set up Row Level Security policies';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 Next steps:';
  RAISE NOTICE '  1. Update backend environment variables';
  RAISE NOTICE '  2. Deploy the updated backend code';
  RAISE NOTICE '  3. Test with admin credentials';
END $$;