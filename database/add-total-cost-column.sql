-- Add total_cost column to campaigns table
-- This enables proper cost tracking for campaigns based on individual call costs

BEGIN;

-- Add total_cost column to campaigns table if it doesn't exist
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS total_cost DECIMAL(10,4) DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN campaigns.total_cost IS 'Total aggregated cost of all calls in this campaign';

-- Create index for performance on cost-related queries
CREATE INDEX IF NOT EXISTS idx_campaigns_total_cost ON campaigns(total_cost);

-- Update existing campaigns with calculated costs from calls
UPDATE campaigns 
SET total_cost = (
    SELECT COALESCE(SUM(cost), 0) 
    FROM calls 
    WHERE calls.campaign_id = campaigns.id
);

COMMIT; 