-- VAPI Key Management Migration
-- Execute this entire script in Supabase SQL Editor
-- This updates the schema to properly handle VAPI public and private keys

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

-- Step 6: Enable RLS on audit table
ALTER TABLE vapi_key_audit ENABLE ROW LEVEL SECURITY;

-- Step 7: Create RLS policies for organizations table
-- Note: Adjust these policies based on your authentication setup

-- Drop existing policies if they exist (safe to ignore errors if they don't exist)
DROP POLICY IF EXISTS "vapi_keys_admin_only_read" ON organizations;
DROP POLICY IF EXISTS "vapi_keys_admin_only_write" ON organizations;
DROP POLICY IF EXISTS "organizations_read_policy" ON organizations;
DROP POLICY IF EXISTS "organizations_write_policy" ON organizations;

-- Create read policy: users can see their own organization
CREATE POLICY "organizations_read_policy" ON organizations
FOR SELECT USING (
  -- Users can see their own organization
  id IN (
    SELECT organization_id FROM users 
    WHERE id = auth.uid()
  )
  OR
  -- Or if they have a specific permission (adjust based on your auth system)
  EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role IN ('platform_owner', 'superadmin')
  )
);

-- Create write policy: only admins can update organization settings
CREATE POLICY "organizations_write_policy" ON organizations
FOR UPDATE USING (
  -- Only admins of the organization can update
  id IN (
    SELECT organization_id FROM users 
    WHERE id = auth.uid() 
    AND role IN ('platform_owner', 'client_admin')
  )
)
WITH CHECK (
  -- Same check for updates
  id IN (
    SELECT organization_id FROM users 
    WHERE id = auth.uid() 
    AND role IN ('platform_owner', 'client_admin')
  )
);

-- Step 8: Create RLS policy for audit table
DROP POLICY IF EXISTS "vapi_audit_admin_only" ON vapi_key_audit;

CREATE POLICY "vapi_audit_admin_only" ON vapi_key_audit
FOR ALL USING (
  -- Only admins of the organization can view audit logs
  organization_id IN (
    SELECT organization_id FROM users 
    WHERE id = auth.uid() 
    AND role IN ('platform_owner', 'client_admin')
  )
);

-- Step 9: Create helper function to get organization with sanitized keys for non-admins
CREATE OR REPLACE FUNCTION get_organization_for_user(org_id UUID, user_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  has_vapi_public_key BOOLEAN,
  has_vapi_private_key BOOLEAN,
  vapi_public_key TEXT,
  vapi_private_key TEXT,
  vapi_webhook_url TEXT,
  settings JSONB
) AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Get user role
  SELECT role INTO user_role
  FROM users
  WHERE users.id = user_id
  AND organization_id = org_id;
  
  -- Return data based on role
  RETURN QUERY
  SELECT 
    o.id,
    o.name,
    o.slug,
    (o.vapi_public_key IS NOT NULL OR o.vapi_api_key IS NOT NULL) as has_vapi_public_key,
    (o.vapi_private_key IS NOT NULL) as has_vapi_private_key,
    CASE 
      WHEN user_role IN ('platform_owner', 'client_admin') THEN o.vapi_public_key
      ELSE NULL
    END as vapi_public_key,
    CASE 
      WHEN user_role IN ('platform_owner', 'client_admin') THEN o.vapi_private_key
      ELSE NULL
    END as vapi_private_key,
    CASE 
      WHEN user_role IN ('platform_owner', 'client_admin') THEN o.vapi_webhook_url
      ELSE NULL
    END as vapi_webhook_url,
    o.settings
  FROM organizations o
  WHERE o.id = org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 10: Grant necessary permissions
GRANT SELECT ON organizations TO authenticated;
GRANT UPDATE (name, slug, settings, vapi_public_key, vapi_private_key, vapi_webhook_url, updated_at) ON organizations TO authenticated;
GRANT SELECT, INSERT ON vapi_key_audit TO authenticated;
GRANT EXECUTE ON FUNCTION get_organization_for_user TO authenticated;

-- Step 11: Create webhook_logs table if it doesn't exist
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

-- Step 12: Create vapi_assistants table if it doesn't exist
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

-- Step 13: Add provider column to phone_numbers if it doesn't exist
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

-- Step 14: Verification query - run this to check the migration worked
DO $$
BEGIN
  RAISE NOTICE 'Migration completed successfully!';
  RAISE NOTICE 'Tables created/updated: organizations, vapi_key_audit, webhook_logs, vapi_assistants, phone_numbers';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Update your backend environment variables';
  RAISE NOTICE '2. Deploy the updated backend code';
  RAISE NOTICE '3. Test the new endpoints with admin credentials';
END $$;