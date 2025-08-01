const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function fixCallCampaignAssociation() {
  console.log('🔧 Fixing call-campaign associations and recordings...\n');

  // First, let's check the call details for the problematic calls
  const { data: call503 } = await client
    .from('calls')
    .select('*')
    .eq('id', 'a51ed739-21dc-4b66-99d6-d1f0b5482743')
    .single();

  const { data: call716 } = await client
    .from('calls')
    .select('*')
    .eq('id', 'd6e2f853-3281-42ed-9f21-099f7a0f7b6a')
    .single();

  console.log('Call ending in 503 (Sanya):');
  console.log('- Campaign ID:', call503?.campaign_id);
  console.log('- VAPI Call ID:', call503?.vapi_call_id);
  console.log('- Recording URL:', call503?.recording_url?.substring(0, 60) + '...');
  console.log('- Phone:', call503?.phone_number);

  console.log('\nCall ending in 716 (Sean):');
  console.log('- Campaign ID:', call716?.campaign_id);
  console.log('- VAPI Call ID:', call716?.vapi_call_id);
  console.log('- Recording URL:', call716?.recording_url?.substring(0, 60) + '...');
  console.log('- Phone:', call716?.phone_number);

  // Get all calls with their VAPI IDs to see the mapping
  const { data: allCalls } = await client
    .from('calls')
    .select('id, customer_name, phone_number, vapi_call_id, campaign_id, recording_url')
    .not('vapi_call_id', 'is', null)
    .order('created_at', { ascending: false });

  console.log('\n📊 All calls with VAPI IDs:');
  allCalls?.forEach(call => {
    console.log(`\n${call.customer_name} (${call.phone_number?.slice(-4)})`);
    console.log(`  Call ID: ${call.id}`);
    console.log(`  VAPI ID: ${call.vapi_call_id}`);
    console.log(`  Campaign: ${call.campaign_id?.substring(0, 8)}...`);
    console.log(`  Recording: ${call.recording_url ? 'Yes' : 'No'}`);
  });

  // Now let's check which VAPI call IDs actually belong to which phone numbers
  console.log('\n🔍 Checking VAPI call ID assignments...');
  
  // If recordings are mismatched, we need to swap them based on the actual VAPI call IDs
  // The VAPI call ID should match the actual call that was made
}

fixCallCampaignAssociation().then(() => process.exit(0));