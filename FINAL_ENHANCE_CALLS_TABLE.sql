-- Final SQL to enhance calls table for complete VAPI webhook data capture
-- Copy and paste this into Supabase Dashboard -> SQL Editor -> Run

-- Add missing fields for complete VAPI webhook capture
ALTER TABLE calls ADD COLUMN IF NOT EXISTS raw_webhook_data JSONB;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS vapi_webhook_received_at TIMESTAMP;

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_calls_vapi_call_id ON calls(vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_calls_raw_webhook_data ON calls USING GIN (raw_webhook_data);
CREATE INDEX IF NOT EXISTS idx_calls_webhook_received ON calls(vapi_webhook_received_at);

-- Verification: Check that the new fields were added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'calls' 
AND column_name IN ('raw_webhook_data', 'vapi_webhook_received_at', 'vapi_call_id', 'recording_url', 'transcript', 'outcome')
ORDER BY column_name;