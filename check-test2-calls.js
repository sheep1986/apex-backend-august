const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function checkTest2Calls() {
  console.log('🔍 Checking test 2 campaign calls...\n');

  // Get the specific calls shown in the screenshot
  const callIds = [
    '887729af-0133-41f7-a158-90d775e8f87e',
    '904dd554-b4a6-4a2c-bb42-fae384470e4d'
  ];

  for (const callId of callIds) {
    const { data: call, error } = await client
      .from('calls')
      .select('*')
      .eq('id', callId)
      .single();

    if (error) {
      console.error(`❌ Error fetching call ${callId}:`, error);
      continue;
    }

    console.log(`📞 Call ID: ${call.id.substring(0, 8)}...`);
    console.log(`   Customer: ${call.customer_name}`);
    console.log(`   Phone: ${call.to_number || call.phone_number}`);
    console.log(`   Status: ${call.status}`);
    console.log(`   Recording URL: ${call.recording_url || 'null'}`);
    console.log(`   Has transcript: ${!!call.transcript}`);
    console.log(`   Duration: ${call.duration}s`);
    console.log('');
  }

  // Also check all calls in test 2 campaign
  const { data: campaign } = await client
    .from('campaigns')
    .select('id')
    .eq('name', 'test 1')
    .single();

  if (campaign) {
    const { data: allCalls } = await client
      .from('calls')
      .select('id, customer_name, recording_url, status')
      .eq('campaign_id', campaign.id);

    console.log(`\n📊 All calls in test 2 campaign:`);
    allCalls?.forEach(call => {
      console.log(`   ${call.id.substring(0, 8)}... : ${call.customer_name} - ${call.status} - Recording: ${call.recording_url ? 'YES' : 'NO'}`);
    });
  }
}

checkTest2Calls().then(() => process.exit(0));