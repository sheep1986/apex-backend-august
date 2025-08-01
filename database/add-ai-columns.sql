-- Add AI processing columns to calls table
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS is_qualified_lead BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS contact_info JSONB,
ADD COLUMN IF NOT EXISTS crm_status TEXT;

-- Add index for faster qualified lead queries
CREATE INDEX IF NOT EXISTS idx_calls_qualified_leads 
ON calls(organization_id, is_qualified_lead) 
WHERE is_qualified_lead = true;