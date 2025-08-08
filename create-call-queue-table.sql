-- Create call_queue table for campaign automation
-- This table manages the queue of calls to be made

CREATE TABLE IF NOT EXISTS call_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES campaign_contacts(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  contact_name TEXT,
  contact_data JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'calling', 'completed', 'failed', 'retry')),
  attempts INTEGER DEFAULT 0,
  next_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  outcome TEXT,
  call_id UUID,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_call_queue_campaign_id ON call_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_call_queue_status ON call_queue(status);
CREATE INDEX IF NOT EXISTS idx_call_queue_next_attempt ON call_queue(next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_call_queue_contact_id ON call_queue(contact_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_call_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-update updated_at
CREATE TRIGGER call_queue_updated_at_trigger
  BEFORE UPDATE ON call_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_call_queue_updated_at();

-- Enable RLS
ALTER TABLE call_queue ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Organizations can manage their call queues" ON call_queue
  FOR ALL
  USING (campaign_id IN (
    SELECT id FROM campaigns WHERE organization_id IN (
      SELECT organization_id FROM auth.users WHERE id = auth.uid()
    )
  ));

-- Grant permissions
GRANT ALL ON call_queue TO authenticated;
GRANT USAGE ON SEQUENCE call_queue_id_seq TO authenticated;