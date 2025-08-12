#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createWebhookLogsTable() {
  console.log('📊 Creating webhook_logs table in Supabase...\n');
  
  // First check if table exists
  const { data: tables, error: checkError } = await supabase
    .from('webhook_logs')
    .select('*')
    .limit(1);
  
  if (!checkError) {
    console.log('ℹ️  Table webhook_logs already exists');
    return true;
  }
  
  console.log('Creating new table...');
  
  // Since we can't run raw SQL directly, we'll check if the table needs creation
  // If the table doesn't exist, you'll need to run this SQL in Supabase dashboard
  
  const sql = `
-- Create webhook_logs table for storing raw VAPI webhooks
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
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_webhook_logs_call_id ON webhook_logs(call_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_event_id ON webhook_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status ON webhook_logs(status);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_received_at ON webhook_logs(received_at);

-- Add unique constraint for idempotency (optional - remove if duplicates are ok)
-- ALTER TABLE webhook_logs ADD CONSTRAINT unique_event_id UNIQUE (event_id);
`;

  console.log('❗ Table does not exist. Please run this SQL in Supabase SQL Editor:\n');
  console.log('=' .repeat(60));
  console.log(sql);
  console.log('=' .repeat(60));
  console.log('\nSteps:');
  console.log('1. Go to Supabase Dashboard');
  console.log('2. Navigate to SQL Editor');
  console.log('3. Paste the SQL above');
  console.log('4. Click "Run"');
  console.log('\nThis table is required for the new fast ACK webhook handler.');
  
  return false;
}

// Run the check
createWebhookLogsTable().then(success => {
  if (success) {
    console.log('\n✅ Database ready for fast ACK webhook!');
  } else {
    console.log('\n⚠️  Manual action required - create table in Supabase');
  }
}).catch(console.error);