-- Add VAPI integration fields to campaigns table
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS vapi_assistant_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS vapi_assistant_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS vapi_script_version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS vapi_last_synced TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS vapi_sync_status VARCHAR(50) DEFAULT 'pending';

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_campaigns_vapi_assistant ON campaigns(vapi_assistant_id);

-- Add comments for documentation
COMMENT ON COLUMN campaigns.vapi_assistant_id IS 'VAPI assistant ID linked to this campaign';
COMMENT ON COLUMN campaigns.vapi_assistant_name IS 'Name of the VAPI assistant for easy reference';
COMMENT ON COLUMN campaigns.vapi_script_version IS 'Version number for tracking script updates';
COMMENT ON COLUMN campaigns.vapi_last_synced IS 'Last time the VAPI script was synchronized';
COMMENT ON COLUMN campaigns.vapi_sync_status IS 'Status of VAPI sync: pending, synced, error';

-- Create table to track script optimization history
CREATE TABLE IF NOT EXISTS vapi_script_optimization_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  assistant_id VARCHAR(255) NOT NULL,
  script_version INTEGER NOT NULL,
  optimization_type VARCHAR(50), -- 'manual', 'auto', 'ab_test'
  changes_made JSONB,
  performance_metrics JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create table for A/B testing different scripts
CREATE TABLE IF NOT EXISTS vapi_script_ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  variant_a_script TEXT NOT NULL,
  variant_b_script TEXT NOT NULL,
  variant_a_calls INTEGER DEFAULT 0,
  variant_b_calls INTEGER DEFAULT 0,
  variant_a_qualified INTEGER DEFAULT 0,
  variant_b_qualified INTEGER DEFAULT 0,
  winning_variant CHAR(1), -- 'A' or 'B'
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'completed', 'cancelled'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);