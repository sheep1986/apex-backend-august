require('dotenv').config();

// For now, let's just create a test record to verify we can insert into the table
// We'll assume the table gets created manually via the Supabase dashboard

const { createClient } = require('@supabase/supabase-js');

async function testTableCreation() {
  console.log('🔗 Connecting to Supabase...');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Test if we can access the table (it might already exist)
  console.log('🧪 Testing if vapi_webhook_data table exists...');
  
  try {
    const { data, error } = await supabase
      .from('vapi_webhook_data')
      .select('id')
      .limit(1);
    
    if (error) {
      if (error.code === '42P01') {
        console.log('❌ Table does not exist yet');
        console.log('📋 Please create it manually using the Supabase dashboard with this SQL:');
        console.log('');
        console.log('CREATE TABLE vapi_webhook_data (');
        console.log('  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),');
        console.log('  webhook_type VARCHAR(100) NOT NULL,');
        console.log('  webhook_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),');
        console.log('  vapi_call_id VARCHAR(255) NOT NULL,');
        console.log('  phone_number VARCHAR(50),');
        console.log('  user_email VARCHAR(255),');
        console.log('  call_status VARCHAR(100),');
        console.log('  call_duration INTEGER DEFAULT 0,');
        console.log('  call_cost DECIMAL(10,4) DEFAULT 0,');
        console.log('  transcript TEXT,');
        console.log('  summary TEXT,');
        console.log('  recording_url TEXT,');
        console.log('  raw_webhook_payload JSONB NOT NULL,');
        console.log('  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()');
        console.log(');');
      } else {
        console.error('❌ Error accessing table:', error);
      }
    } else {
      console.log('✅ Table exists and is accessible');
      console.log('✅ Ready to proceed with webhook implementation');
    }
  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
  }
}

testTableCreation();