-- Create webhook_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id VARCHAR(255),
  event_type VARCHAR(100),
  call_id VARCHAR(255),
  payload JSONB,
  received_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'received',
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Indexes for performance
  INDEX idx_webhook_logs_call_id (call_id),
  INDEX idx_webhook_logs_event_id (event_id),
  INDEX idx_webhook_logs_status (status),
  INDEX idx_webhook_logs_received_at (received_at)
);

-- Add unique constraint for idempotency
ALTER TABLE webhook_logs 
ADD CONSTRAINT unique_event_id UNIQUE (event_id);
