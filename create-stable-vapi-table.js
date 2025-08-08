require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function createStableVapiTable() {
  console.log('🔗 Connecting to Supabase...');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Create the main table
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS vapi_webhook_data (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      
      -- Core webhook identification
      webhook_type VARCHAR(100) NOT NULL,
      webhook_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      webhook_id VARCHAR(255),
      
      -- Call identification (simple, no foreign keys)
      vapi_call_id VARCHAR(255) NOT NULL,
      phone_number VARCHAR(50),
      caller_number VARCHAR(50),
      
      -- User identification (email-based, no org dependency)
      user_email VARCHAR(255),
      platform_owner_email VARCHAR(255) DEFAULT 'sean@artificialmedia.co.uk',
      
      -- Core call data
      call_status VARCHAR(100),
      call_direction VARCHAR(20),
      call_duration INTEGER DEFAULT 0,
      call_cost DECIMAL(10,4) DEFAULT 0,
      call_started_at TIMESTAMP WITH TIME ZONE,
      call_ended_at TIMESTAMP WITH TIME ZONE,
      end_reason VARCHAR(255),
      
      -- AI & Voice data
      transcript TEXT,
      summary TEXT,
      recording_url TEXT,
      recording_duration INTEGER DEFAULT 0,
      
      -- Assistant & configuration data
      assistant_id VARCHAR(255),
      assistant_name VARCHAR(255),
      phone_number_id VARCHAR(255),
      
      -- Outcome & disposition
      call_disposition VARCHAR(100),
      call_outcome TEXT,
      sentiment VARCHAR(50),
      
      -- Raw data preservation (MOST IMPORTANT for stability)
      raw_webhook_payload JSONB NOT NULL,
      raw_call_data JSONB,
      raw_assistant_data JSONB,
      raw_phone_data JSONB,
      
      -- Metadata for debugging and tracking
      processing_status VARCHAR(50) DEFAULT 'processed',
      processing_notes TEXT,
      source_ip VARCHAR(50),
      user_agent TEXT,
      
      -- Timestamps
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `;

  try {
    console.log('📝 Creating vapi_webhook_data table...');
    const { error: tableError } = await supabase.rpc('exec', { sql: createTableSQL });
    
    if (tableError) {
      console.error('❌ Error creating table:', tableError);
    } else {
      console.log('✅ Table created successfully');
    }

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_vapi_webhook_call_id ON vapi_webhook_data(vapi_call_id);',
      'CREATE INDEX IF NOT EXISTS idx_vapi_webhook_type ON vapi_webhook_data(webhook_type);',
      'CREATE INDEX IF NOT EXISTS idx_vapi_webhook_timestamp ON vapi_webhook_data(webhook_timestamp);',
      'CREATE INDEX IF NOT EXISTS idx_vapi_webhook_user_email ON vapi_webhook_data(user_email);',
      'CREATE INDEX IF NOT EXISTS idx_vapi_webhook_phone ON vapi_webhook_data(phone_number);',
      'CREATE INDEX IF NOT EXISTS idx_vapi_webhook_status ON vapi_webhook_data(call_status);',
      'CREATE INDEX IF NOT EXISTS idx_vapi_webhook_created ON vapi_webhook_data(created_at);'
    ];

    console.log('📝 Creating indexes...');
    for (const indexSQL of indexes) {
      const { error: indexError } = await supabase.rpc('exec', { sql: indexSQL });
      if (indexError) {
        console.log('⚠️ Index creation note:', indexError.message);
      }
    }

    // Test the table
    console.log('🧪 Testing table access...');
    const { data, error: testError } = await supabase
      .from('vapi_webhook_data')
      .select('id')
      .limit(1);
    
    if (testError) {
      console.error('❌ Error accessing table:', testError);
    } else {
      console.log('✅ Table is accessible');
      console.log('✅ Stable VAPI webhook data capture system is ready!');
    }

  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
  }
}

createStableVapiTable();