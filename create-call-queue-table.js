#!/usr/bin/env node

// Script to create the call_queue table
// Run: node create-call-queue-table.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://twigokrtbvigiqnaybfy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function createCallQueueTable() {
  console.log('🔧 Creating call_queue table...\n');
  
  const sql = `
    -- Create call_queue table for campaign automation
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
  `;
  
  try {
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      // Try direct query approach
      console.log('Trying alternative approach...');
      
      // Create table
      const { error: createError } = await supabase
        .from('call_queue')
        .select('id')
        .limit(1);
      
      if (createError && createError.message.includes('relation "call_queue" does not exist')) {
        console.error('❌ Table does not exist and cannot create it via API');
        console.log('\n📝 Please run this SQL in Supabase Dashboard:');
        console.log('---');
        console.log(sql);
        console.log('---');
      } else if (!createError) {
        console.log('✅ Table call_queue already exists!');
      } else {
        console.error('❌ Error:', createError);
      }
    } else {
      console.log('✅ call_queue table created successfully!');
    }
    
    // Test the table
    console.log('\n🔍 Testing call_queue table...');
    const { data, error: testError } = await supabase
      .from('call_queue')
      .select('COUNT(*)');
    
    if (!testError) {
      console.log('✅ Table is accessible');
    } else {
      console.log('❌ Table test failed:', testError.message);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.log('\n📝 Please create the table manually in Supabase Dashboard');
    console.log('Copy the SQL from create-call-queue-table.sql');
  }
}

createCallQueueTable();