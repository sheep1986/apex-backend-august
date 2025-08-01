require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

async function createTableDirect() {
  console.log('🔗 Connecting to Supabase...');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // First, let's see what RPC functions are available
  console.log('🔍 Checking available RPC functions...');
  
  try {
    // Try different approaches to execute SQL
    const approaches = [
      // Try with sql_exec if it exists
      async () => {
        const { data, error } = await supabase.rpc('sql_exec', { 
          query: "SELECT 'test' as result;" 
        });
        return { data, error, method: 'sql_exec' };
      },
      
      // Try with execute_sql if it exists
      async () => {
        const { data, error } = await supabase.rpc('execute_sql', { 
          sql: "SELECT 'test' as result;" 
        });
        return { data, error, method: 'execute_sql' };
      },
      
      // Try with exec_sql if it exists
      async () => {
        const { data, error } = await supabase.rpc('exec_sql', { 
          sql: "SELECT 'test' as result;" 
        });
        return { data, error, method: 'exec_sql' };
      }
    ];

    let workingMethod = null;
    for (const approach of approaches) {
      try {
        const result = await approach();
        if (!result.error) {
          console.log(`✅ Found working method: ${result.method}`);
          workingMethod = result.method;
          break;
        } else {
          console.log(`❌ ${result.method} failed:`, result.error.message);
        }
      } catch (err) {
        console.log(`❌ ${approach.name} crashed:`, err.message);
      }
    }

    if (!workingMethod) {
      console.log('❌ No working SQL execution method found.');
      console.log('📋 Please create the table manually using the SQL in stable-vapi-webhook-schema.sql');
      console.log('You can run this SQL directly in your Supabase dashboard SQL editor.');
      return;
    }

    // If we found a working method, use it to create the table
    console.log(`✅ Using ${workingMethod} to create table...`);
    
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS vapi_webhook_data (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        webhook_type VARCHAR(100) NOT NULL,
        webhook_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        webhook_id VARCHAR(255),
        vapi_call_id VARCHAR(255) NOT NULL,
        phone_number VARCHAR(50),
        caller_number VARCHAR(50),
        user_email VARCHAR(255),
        platform_owner_email VARCHAR(255) DEFAULT 'sean@artificialmedia.co.uk',
        call_status VARCHAR(100),
        call_direction VARCHAR(20),
        call_duration INTEGER DEFAULT 0,
        call_cost DECIMAL(10,4) DEFAULT 0,
        call_started_at TIMESTAMP WITH TIME ZONE,
        call_ended_at TIMESTAMP WITH TIME ZONE,
        end_reason VARCHAR(255),
        transcript TEXT,
        summary TEXT,
        recording_url TEXT,
        recording_duration INTEGER DEFAULT 0,
        assistant_id VARCHAR(255),
        assistant_name VARCHAR(255),
        phone_number_id VARCHAR(255),
        call_disposition VARCHAR(100),
        call_outcome TEXT,
        sentiment VARCHAR(50),
        raw_webhook_payload JSONB NOT NULL,
        raw_call_data JSONB,
        raw_assistant_data JSONB,
        raw_phone_data JSONB,
        processing_status VARCHAR(50) DEFAULT 'processed',
        processing_notes TEXT,
        source_ip VARCHAR(50),
        user_agent TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    const params = workingMethod === 'sql_exec' ? { query: createTableSQL } : { sql: createTableSQL };
    const { data, error } = await supabase.rpc(workingMethod, params);
    
    if (error) {
      console.error('❌ Error creating table:', error);
    } else {
      console.log('✅ Table created successfully');
    }

  } catch (err) {
    console.error('❌ Script error:', err.message);
    console.log('\n📋 Manual Instructions:');
    console.log('1. Go to your Supabase dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Run the SQL from: stable-vapi-webhook-schema.sql');
  }
}

createTableDirect();