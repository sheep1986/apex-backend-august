require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  console.log('🔍 Checking call_attempts table schema...');
  
  // Try to get the table structure by creating a test record (that will fail)
  const { error } = await supabase
    .from('call_attempts')
    .insert({
      test: 'test'
    });

  if (error) {
    console.log('❌ Error (expected):', error.message);
    console.log('📋 Error details:', error.details);
    console.log('📋 Error hint:', error.hint);
  }

  // Also check if table exists by trying to select
  const { data, error: selectError } = await supabase
    .from('call_attempts')
    .select('*')
    .limit(1);

  if (selectError) {
    console.log('❌ Table access error:', selectError.message);
  } else {
    console.log('✅ call_attempts table accessible');
    if (data && data.length > 0) {
      console.log('📋 Sample record fields:', Object.keys(data[0]));
    } else {
      console.log('📭 No existing records in call_attempts table');
    }
  }
}

checkSchema();