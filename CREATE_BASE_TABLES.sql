-- Create Base Tables for Apex AI Platform
-- Run this BEFORE the VAPI migration if tables don't exist

-- Step 1: Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  type TEXT DEFAULT 'agency',
  status TEXT DEFAULT 'active',
  plan TEXT DEFAULT 'starter',
  monthly_cost DECIMAL(10,2) DEFAULT 0,
  primary_color TEXT DEFAULT '#3B82F6',
  secondary_color TEXT DEFAULT '#1e40af',
  call_limit INTEGER DEFAULT 1000,
  user_limit INTEGER DEFAULT 10,
  storage_limit_gb INTEGER DEFAULT 10,
  vapi_api_key TEXT, -- Will be renamed to vapi_public_key in migration
  vapi_private_key TEXT,
  vapi_webhook_url TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT DEFAULT 'active',
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  permissions JSONB DEFAULT '{}',
  email_verified BOOLEAN DEFAULT false,
  timezone TEXT DEFAULT 'UTC',
  language TEXT DEFAULT 'en',
  invitation_token TEXT,
  invitation_expires_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 3: Create phone_numbers table
CREATE TABLE IF NOT EXISTS phone_numbers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  friendly_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, phone_number)
);

-- Step 4: Create campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft',
  type TEXT DEFAULT 'outbound',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 5: Create indexes
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_organization ON phone_numbers(organization_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_organization ON campaigns(organization_id);

-- Step 6: Enable Row Level Security
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- Basic RLS Policies (will be enhanced in VAPI migration)
CREATE POLICY "Enable read access for authenticated users" ON organizations
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for authenticated users" ON users
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for authenticated users" ON phone_numbers
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for authenticated users" ON campaigns
  FOR SELECT USING (true);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Base tables created successfully!';
  RAISE NOTICE 'You can now run the VAPI migration (EXECUTE_IN_SUPABASE.sql)';
END $$;