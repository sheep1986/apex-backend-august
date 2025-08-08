const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function checkSyncedData() {
  console.log('📊 Checking synced VAPI data...\n');

  // Get all calls with VAPI data
  const { data: calls, error } = await client
    .from('calls')
    .select('id, customer_name, duration, recording_url, transcript, vapi_call_id')
    .not('vapi_call_id', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Found ${calls.length} calls with VAPI IDs:\n`);

  for (const call of calls) {
    console.log(`📞 ${call.customer_name || 'Unknown'} (${call.duration}s)`);
    console.log(`   VAPI ID: ${call.vapi_call_id}`);
    console.log(`   Recording: ${call.recording_url ? '✅ ' + call.recording_url.substring(0, 60) + '...' : '❌ None'}`);
    console.log(`   Transcript: ${call.transcript ? '✅ ' + call.transcript.substring(0, 50) + '...' : '❌ None'}`);
    console.log('');
  }
}

checkSyncedData().then(() => process.exit(0));