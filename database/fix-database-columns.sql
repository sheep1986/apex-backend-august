-- Fix Missing Database Columns for VAPI Integration
-- This script adds all the missing columns that the backend code expects

-- 1. Add missing columns to organizations table
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS vapi_settings JSONB DEFAULT '{}';

ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS vapi_api_key VARCHAR(255);

ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS vapi_private_key VARCHAR(255);

ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS vapi_webhook_url VARCHAR(255);

-- 2. Add missing columns to campaigns table  
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS assistant_id VARCHAR(255);

ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS phone_number_id VARCHAR(255);

ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS vapi_campaign_id VARCHAR(255);

-- 3. Add missing columns to leads table
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';

-- 4. Add missing columns to calls table
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS assistant_id VARCHAR(255);

ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50);

-- 5. Update existing data to set default values
UPDATE organizations SET settings = '{}' WHERE settings IS NULL;
UPDATE organizations SET vapi_settings = '{}' WHERE vapi_settings IS NULL;
UPDATE leads SET status = 'pending' WHERE status IS NULL;

-- 6. Add unique constraint for leads (organization_id, phone) if it doesn't exist
-- Note: This will create constraint only if it doesn't already exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'leads_organization_id_phone_key'
    ) THEN
        ALTER TABLE leads 
        ADD CONSTRAINT leads_organization_id_phone_key 
        UNIQUE (organization_id, phone);
    END IF;
END $$;

-- 7. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_leads_campaign_id ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_calls_campaign_id ON calls(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_organization_id ON campaigns(organization_id); 