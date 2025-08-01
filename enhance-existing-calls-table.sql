-- Enhance existing calls table for complete VAPI webhook data capture
-- Run this in your Supabase Dashboard -> SQL Editor

-- Add missing fields for complete VAPI webhook capture
ALTER TABLE calls ADD COLUMN IF NOT EXISTS raw_webhook_data JSONB;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS vapi_webhook_received_at TIMESTAMP;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_calls_vapi_call_id ON calls(vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_calls_raw_webhook_data ON calls USING GIN (raw_webhook_data);
CREATE INDEX IF NOT EXISTS idx_calls_webhook_received ON calls(vapi_webhook_received_at);

-- Verification query to check the table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'calls' 
ORDER BY ordinal_position;