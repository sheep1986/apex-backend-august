-- Stable VAPI Webhook Data Capture Table
-- Run this in your Supabase Dashboard -> SQL Editor

-- Create the main table
CREATE TABLE IF NOT EXISTS stable_vapi_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vapi_call_id TEXT UNIQUE,
  user_email TEXT NOT NULL,
  campaign_name TEXT,
  campaign_id TEXT,
  lead_name TEXT,
  lead_phone TEXT,
  call_status TEXT,
  call_type TEXT,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  duration_seconds INTEGER,
  recording_url TEXT,
  transcript TEXT,
  outcome TEXT,
  sentiment TEXT,
  cost DECIMAL(10,4),
  raw_webhook_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_stable_vapi_calls_user_email ON stable_vapi_calls(user_email);
CREATE INDEX IF NOT EXISTS idx_stable_vapi_calls_vapi_call_id ON stable_vapi_calls(vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_stable_vapi_calls_started_at ON stable_vapi_calls(started_at);
CREATE INDEX IF NOT EXISTS idx_stable_vapi_calls_campaign_name ON stable_vapi_calls(campaign_name);
CREATE INDEX IF NOT EXISTS idx_stable_vapi_calls_call_status ON stable_vapi_calls(call_status);

-- Create GIN index for JSONB search (for transcript and raw data search)
CREATE INDEX IF NOT EXISTS idx_stable_vapi_calls_raw_data ON stable_vapi_calls USING GIN (raw_webhook_data);

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger
DROP TRIGGER IF EXISTS update_stable_vapi_calls_updated_at ON stable_vapi_calls;
CREATE TRIGGER update_stable_vapi_calls_updated_at
  BEFORE UPDATE ON stable_vapi_calls
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Verification query
SELECT 
  schemaname, 
  tablename, 
  tableowner 
FROM pg_tables 
WHERE tablename = 'stable_vapi_calls';