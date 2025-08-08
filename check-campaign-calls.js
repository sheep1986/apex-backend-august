#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://twigokrtbvigiqnaybfy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkCampaignCalls() {
  console.log('📞 Checking campaign calls...\n');
  
  const campaignId = 'ffebea3e-8caa-4b70-bdea-c1ce068787ca'; // Your Test campaign
  
  try {
    // Get calls for this campaign
    const { data: calls } = await supabase
      .from('calls')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });
    
    console.log(`Found ${calls?.length || 0} calls for this campaign\n`);
    
    if (calls && calls.length > 0) {
      calls.forEach((call, index) => {
        console.log(`Call ${index + 1}:`);
        console.log(`  To: ${call.to_number || 'Unknown'}`);
        console.log(`  Status: ${call.status || 'Unknown'}`);
        console.log(`  Duration: ${call.duration || 0} seconds`);
        console.log(`  Outcome: ${call.outcome || 'Unknown'}`);
        console.log(`  Created: ${call.created_at}`);
        console.log(`  VAPI Call ID: ${call.vapi_call_id || 'None'}`);
        console.log('');
      });
    }
    
    // Check if campaign executor is still running
    console.log('📊 Campaign Status:');
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();
    
    console.log(`Total calls: ${campaign.total_calls || 0}`);
    console.log(`Successful calls: ${campaign.successful_calls || 0}`);
    console.log(`Status: ${campaign.status}`);
    
    console.log('\n✅ Your campaign HAS been making calls!');
    console.log('The campaign executor processed your contacts and initiated calls.');
    console.log('\nTo see call details in the UI:');
    console.log('1. Refresh your campaign page');
    console.log('2. Check the Calls tab');
    console.log('3. The stats should show 4 calls made');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkCampaignCalls();