require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTables() {
  console.log('🔍 Checking existing tables related to calls...');
  
  const tablesToCheck = [
    'calls',
    'call_attempts',
    'call_data',
    'vapi_calls',
    'vapi_call_data',
    'call_logs',
    'phone_calls'
  ];

  for (const table of tablesToCheck) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (!error) {
        console.log(`✅ ${table} table exists`);
        if (data && data.length > 0) {
          console.log(`   📋 Fields: ${Object.keys(data[0]).join(', ')}`);
        } else {
          console.log(`   📭 Table is empty`);
        }
      } else {
        console.log(`❌ ${table} table does not exist`);
      }
    } catch (e) {
      console.log(`❌ ${table} error: ${e.message}`);
    }
  }
}

checkTables();