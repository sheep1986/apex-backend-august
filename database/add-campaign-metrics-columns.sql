-- Add missing columns to campaigns table for proper metrics tracking
-- This ensures the campaign dashboard displays correct statistics

-- Add total_leads column if it doesn't exist
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS total_leads INTEGER DEFAULT 0;

-- Add calls_completed column if it doesn't exist  
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS calls_completed INTEGER DEFAULT 0;

-- Add total_cost column if it doesn't exist
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS total_cost DECIMAL(10,2) DEFAULT 0.00;

-- Add success_rate column (computed from other fields)
-- This is optional as it can be calculated on the fly
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS success_rate DECIMAL(5,2) DEFAULT 0.00;

-- Update existing campaigns with correct metrics from leads and calls tables
UPDATE campaigns c
SET 
  total_leads = COALESCE((
    SELECT COUNT(*) 
    FROM leads l 
    WHERE l.campaign_id = c.id
  ), 0),
  calls_completed = COALESCE((
    SELECT COUNT(*) 
    FROM calls cl 
    WHERE cl.campaign_id = c.id 
    AND cl.status = 'completed'
  ), 0),
  total_cost = COALESCE((
    SELECT SUM(cl.cost) 
    FROM calls cl 
    WHERE cl.campaign_id = c.id
  ), 0),
  success_rate = CASE 
    WHEN EXISTS (
      SELECT 1 FROM calls cl WHERE cl.campaign_id = c.id
    ) THEN COALESCE((
      SELECT (COUNT(CASE WHEN cl.outcome IN ('interested', 'converted', 'callback') THEN 1 END) * 100.0 / COUNT(*))
      FROM calls cl 
      WHERE cl.campaign_id = c.id 
      AND cl.status = 'completed'
    ), 0)
    ELSE 0
  END
WHERE c.type = 'outbound';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaigns_total_leads ON campaigns(total_leads);
CREATE INDEX IF NOT EXISTS idx_campaigns_calls_completed ON campaigns(calls_completed);
CREATE INDEX IF NOT EXISTS idx_campaigns_status_type ON campaigns(status, type);

COMMENT ON COLUMN campaigns.total_leads IS 'Total number of leads in the campaign';
COMMENT ON COLUMN campaigns.calls_completed IS 'Number of calls that have been completed';
COMMENT ON COLUMN campaigns.total_cost IS 'Total cost of all calls in the campaign';
COMMENT ON COLUMN campaigns.success_rate IS 'Percentage of successful outcomes from completed calls';