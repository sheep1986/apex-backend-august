-- Add missing calls_per_day column to campaigns table
-- This column is required for the campaign review and launch functionality

ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS calls_per_day INTEGER DEFAULT 50;

-- Add comment for documentation
COMMENT ON COLUMN campaigns.calls_per_day IS 'Maximum number of calls to make per day for this campaign';

-- Update any existing campaigns to have a default value
UPDATE campaigns 
SET calls_per_day = 50 
WHERE calls_per_day IS NULL;