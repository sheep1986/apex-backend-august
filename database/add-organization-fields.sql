-- Add missing fields to organizations table
-- These fields are needed for complete organization profile management

-- Business information fields
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS billing_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS country VARCHAR(100),
ADD COLUMN IF NOT EXISTS website VARCHAR(255),
ADD COLUMN IF NOT EXISTS industry VARCHAR(100),
ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50);

-- VAPI additional fields
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS vapi_private_key TEXT,
ADD COLUMN IF NOT EXISTS vapi_webhook_secret TEXT,
ADD COLUMN IF NOT EXISTS vapi_webhook_configured BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS webhook_url TEXT,
ADD COLUMN IF NOT EXISTS max_concurrent_calls INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS default_user_role VARCHAR(50) DEFAULT 'client_user',
ADD COLUMN IF NOT EXISTS compliance_settings JSONB DEFAULT '{}';

-- Plan and billing fields
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'starter',
ADD COLUMN IF NOT EXISTS monthly_cost DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS call_limit INTEGER DEFAULT 1000,
ADD COLUMN IF NOT EXISTS user_limit INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS storage_limit_gb INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ;

-- Branding fields
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS primary_color VARCHAR(10) DEFAULT '#10b981',
ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(10) DEFAULT '#ec4899',
ADD COLUMN IF NOT EXISTS custom_domain VARCHAR(255);

-- Add comments for documentation
COMMENT ON COLUMN organizations.billing_email IS 'Primary billing email address';
COMMENT ON COLUMN organizations.phone IS 'Main business phone number';
COMMENT ON COLUMN organizations.address IS 'Business address';
COMMENT ON COLUMN organizations.country IS 'Country of residence/operation';
COMMENT ON COLUMN organizations.website IS 'Company website URL';
COMMENT ON COLUMN organizations.industry IS 'Business industry/sector';
COMMENT ON COLUMN organizations.contact_name IS 'Primary contact person name';
COMMENT ON COLUMN organizations.contact_email IS 'Primary contact email';
COMMENT ON COLUMN organizations.contact_phone IS 'Primary contact phone';

COMMENT ON COLUMN organizations.vapi_private_key IS 'VAPI private API key for server-side operations';
COMMENT ON COLUMN organizations.vapi_webhook_secret IS 'Secret for validating VAPI webhooks';
COMMENT ON COLUMN organizations.vapi_webhook_configured IS 'Whether VAPI webhooks are configured';

COMMENT ON COLUMN organizations.plan IS 'Subscription plan type';
COMMENT ON COLUMN organizations.monthly_cost IS 'Monthly subscription cost';
COMMENT ON COLUMN organizations.call_limit IS 'Monthly call limit (-1 for unlimited)';
COMMENT ON COLUMN organizations.user_limit IS 'Maximum users allowed (-1 for unlimited)';
COMMENT ON COLUMN organizations.storage_limit_gb IS 'Storage limit in GB (-1 for unlimited)';

-- Create indexes for frequently queried fields
CREATE INDEX IF NOT EXISTS idx_organizations_country ON organizations(country);
CREATE INDEX IF NOT EXISTS idx_organizations_industry ON organizations(industry);
CREATE INDEX IF NOT EXISTS idx_organizations_plan ON organizations(plan);
CREATE INDEX IF NOT EXISTS idx_organizations_billing_email ON organizations(billing_email);

-- Update existing records with default values where needed
UPDATE organizations 
SET 
  primary_color = COALESCE(primary_color, '#10b981'),
  secondary_color = COALESCE(secondary_color, '#ec4899'),
  plan = COALESCE(plan, 'starter'),
  user_limit = COALESCE(user_limit, 5),
  call_limit = COALESCE(call_limit, 1000),
  storage_limit_gb = COALESCE(storage_limit_gb, 10),
  max_concurrent_calls = COALESCE(max_concurrent_calls, 10),
  default_user_role = COALESCE(default_user_role, 'client_user')
WHERE 
  primary_color IS NULL 
  OR secondary_color IS NULL 
  OR plan IS NULL
  OR user_limit IS NULL
  OR call_limit IS NULL
  OR storage_limit_gb IS NULL
  OR max_concurrent_calls IS NULL
  OR default_user_role IS NULL;