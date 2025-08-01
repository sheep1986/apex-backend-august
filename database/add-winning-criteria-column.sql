-- Add winning_criteria column to campaigns table
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS winning_criteria JSONB DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN campaigns.winning_criteria IS 'AI lead qualification criteria including main criteria, thresholds, requirements, and disqualifiers';

-- Example structure:
-- {
--   "mainCriteria": "Looking for businesses with 10+ employees...",
--   "minDuration": 30,
--   "autoAcceptScore": 80,
--   "requireCompanySize": true,
--   "minCompanySize": 10,
--   "requireBudget": false,
--   "requireGrowthIntent": true,
--   "disqualifiers": "Already a customer\nCompetitor employee\nOutside service area"
-- }