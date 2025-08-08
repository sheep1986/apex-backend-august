-- Add owner_id column to leads table
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id);

-- Add index for better performance when filtering by owner
CREATE INDEX IF NOT EXISTS idx_leads_owner_id ON leads(owner_id);

-- Update existing leads to set owner based on campaign creator
UPDATE leads l
SET owner_id = c.created_by
FROM campaigns c
WHERE l.campaign_id = c.id
AND l.owner_id IS NULL
AND c.created_by IS NOT NULL;

-- For leads without a campaign, set owner to uploaded_by if available
UPDATE leads
SET owner_id = uploaded_by
WHERE owner_id IS NULL
AND uploaded_by IS NOT NULL;

-- Add comment to explain the column
COMMENT ON COLUMN leads.owner_id IS 'The user who owns this lead. Defaults to campaign creator, can be reassigned.';