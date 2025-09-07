-- Migration to rename vapi_api_key to vapi_public_key while maintaining backward compatibility
-- Author: VAPI Key Management Update
-- Date: 2025-01-11

-- Step 1: Add new vapi_public_key column if it doesn't exist
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS vapi_public_key TEXT;

-- Step 2: Copy existing vapi_api_key data to vapi_public_key
UPDATE organizations 
SET vapi_public_key = vapi_api_key 
WHERE vapi_api_key IS NOT NULL 
  AND vapi_public_key IS NULL;

-- Step 3: Keep vapi_api_key column for backward compatibility but mark it as deprecated
COMMENT ON COLUMN organizations.vapi_api_key IS 'DEPRECATED: Use vapi_public_key instead. Kept for backward compatibility.';
COMMENT ON COLUMN organizations.vapi_public_key IS 'VAPI public key used for webhook signature verification';
COMMENT ON COLUMN organizations.vapi_private_key IS 'VAPI private key used for API authentication - should never be exposed to non-admin users';

-- Step 4: Update Row Level Security policies for admin-only access to keys
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "vapi_keys_admin_only_read" ON organizations;
DROP POLICY IF EXISTS "vapi_keys_admin_only_write" ON organizations;

-- Create new policies for admin-only access to VAPI keys
CREATE POLICY "vapi_keys_admin_only_read" ON organizations
FOR SELECT USING (
  -- Allow users to see their own organization
  auth.uid() IN (
    SELECT id FROM users 
    WHERE organization_id = organizations.id
  )
);

CREATE POLICY "vapi_keys_admin_only_write" ON organizations
FOR UPDATE USING (
  -- Only admins can update VAPI keys
  auth.uid() IN (
    SELECT id FROM users 
    WHERE organization_id = organizations.id 
      AND role IN ('platform_owner', 'client_admin')
  )
);

-- Step 5: Create function to sanitize organization data for non-admin users
CREATE OR REPLACE FUNCTION sanitize_organization_for_user(org_row organizations, user_role TEXT)
RETURNS organizations AS $$
BEGIN
  -- If user is not an admin, hide sensitive keys
  IF user_role NOT IN ('platform_owner', 'client_admin') THEN
    org_row.vapi_public_key := CASE 
      WHEN org_row.vapi_public_key IS NOT NULL THEN 'HIDDEN' 
      ELSE NULL 
    END;
    org_row.vapi_private_key := CASE 
      WHEN org_row.vapi_private_key IS NOT NULL THEN 'HIDDEN' 
      ELSE NULL 
    END;
    org_row.vapi_api_key := CASE 
      WHEN org_row.vapi_api_key IS NOT NULL THEN 'HIDDEN' 
      ELSE NULL 
    END;
  END IF;
  
  RETURN org_row;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_organizations_vapi_public_key ON organizations(vapi_public_key) WHERE vapi_public_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_vapi_private_key ON organizations(vapi_private_key) WHERE vapi_private_key IS NOT NULL;

-- Step 7: Create audit table for tracking key changes
CREATE TABLE IF NOT EXISTS vapi_key_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES users(id),
  change_type TEXT NOT NULL CHECK (change_type IN ('CREATE', 'UPDATE', 'DELETE')),
  field_changed TEXT CHECK (field_changed IN ('vapi_public_key', 'vapi_private_key', 'both')),
  old_value_hash TEXT, -- Store hash of old value for security
  new_value_hash TEXT, -- Store hash of new value for security
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for audit lookups
CREATE INDEX idx_vapi_key_audit_organization ON vapi_key_audit(organization_id);
CREATE INDEX idx_vapi_key_audit_created_at ON vapi_key_audit(created_at);

-- Grant permissions for audit table
GRANT SELECT ON vapi_key_audit TO authenticated;
GRANT INSERT ON vapi_key_audit TO authenticated;

-- Add RLS for audit table
ALTER TABLE vapi_key_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vapi_audit_admin_only" ON vapi_key_audit
FOR ALL USING (
  auth.uid() IN (
    SELECT id FROM users 
    WHERE organization_id = vapi_key_audit.organization_id 
      AND role IN ('platform_owner', 'client_admin')
  )
);