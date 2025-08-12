#!/bin/bash

echo "🚀 Deploying Fast ACK Webhook Handler"
echo "======================================"

# Backup the old webhook
echo "📦 Backing up old webhook..."
cp api/vapi-webhook.ts api/vapi-webhook-old.ts

# Replace with fast ACK version
echo "⚡ Installing fast ACK webhook..."
cp api/vapi-webhook-fast.ts api/vapi-webhook.ts

# Check if webhook_logs table exists, create if not
echo "📊 Ensuring webhook_logs table exists..."
cat << 'EOF' > create-webhook-logs-table.sql
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
EOF

echo "✅ Fast ACK webhook installed!"
echo ""
echo "Next steps:"
echo "1. Run the SQL script in Supabase to create webhook_logs table"
echo "2. Commit and push to deploy:"
echo "   git add api/vapi-webhook.ts"
echo "   git commit -m 'Deploy fast ACK webhook handler per Grok/GPT5 recommendations'"
echo "   git push origin main"
echo ""
echo "The new webhook will:"
echo "- Respond in <1 second (prevents VAPI timeouts)"
echo "- Store raw webhooks for debugging"
echo "- Process async after ACK"
echo "- Handle idempotency properly"
echo "- Poll for missing transcripts"