const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function investigateAllCalls() {
  console.log('🔍 Investigating ALL calls in the system...\n');

  // Get ALL calls for Sanya and Sean
  const { data: allCalls, error } = await client
    .from('calls')
    .select('*')
    .or('customer_name.eq.Sanya,customer_name.eq.Sean,customer_name.eq.Sonia')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching calls:', error);
    return;
  }

  console.log(`📞 Found ${allCalls.length} total calls for Sanya, Sean, and Sonia\n`);

  // Group by customer and campaign
  const callsByCustomer = {};
  allCalls.forEach(call => {
    const key = call.customer_name || 'Unknown';
    if (!callsByCustomer[key]) callsByCustomer[key] = [];
    callsByCustomer[key].push(call);
  });

  // Show all calls per customer
  Object.entries(callsByCustomer).forEach(([customer, calls]) => {
    console.log(`\n👤 ${customer} - ${calls.length} calls:`);
    calls.forEach(call => {
      console.log(`\n   📞 Call ID: ${call.id}`);
      console.log(`      Campaign ID: ${call.campaign_id}`);
      console.log(`      Status: ${call.status}`);
      console.log(`      Duration: ${call.duration}s`);
      console.log(`      Outcome: ${call.outcome || 'null'}`);
      console.log(`      Recording: ${call.recording_url ? '✅ YES' : '❌ NO'}`);
      console.log(`      Transcript: ${call.transcript ? '✅ YES (' + call.transcript.substring(0, 50) + '...)' : '❌ NO'}`);
      console.log(`      Created: ${call.created_at}`);
      console.log(`      Summary: ${call.summary || 'null'}`);
    });
  });

  // Now let's check what campaigns exist and their calls
  console.log('\n\n📊 Campaigns and their call counts:');
  const { data: campaigns } = await client
    .from('campaigns')
    .select('id, name, created_at')
    .order('created_at', { ascending: false });

  for (const campaign of campaigns || []) {
    const { count } = await client
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id);
    
    if (count > 0) {
      console.log(`\n   📁 ${campaign.name} (${campaign.id})`);
      console.log(`      Total calls: ${count}`);
      
      // Get the calls for this campaign
      const { data: campaignCalls } = await client
        .from('calls')
        .select('id, customer_name, duration, status, recording_url')
        .eq('campaign_id', campaign.id);
      
      campaignCalls?.forEach(call => {
        console.log(`      - ${call.customer_name}: ${call.duration}s, ${call.status}, Recording: ${call.recording_url ? 'YES' : 'NO'}`);
      });
    }
  }
}

investigateAllCalls().then(() => process.exit(0));