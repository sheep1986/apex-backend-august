const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function fixPhoneNumberMismatch() {
  console.log('🔧 Fixing phone number and name mismatches...\n');

  // Fix the swapped data for test 1 campaign calls
  const fixes = [
    {
      callId: 'a51ed739-21dc-4b66-99d6-d1f0b5482743',
      correctName: 'Sean',
      correctPhone: '+447526126716'
    },
    {
      callId: 'd6e2f853-3281-42ed-9f21-099f7a0f7b6a', 
      correctName: 'Sanya',
      correctPhone: '+35699477503'
    }
  ];

  for (const fix of fixes) {
    console.log(`Fixing call ${fix.callId}:`);
    console.log(`  Setting name to: ${fix.correctName}`);
    console.log(`  Setting phone to: ${fix.correctPhone}`);
    
    const { error } = await client
      .from('calls')
      .update({
        customer_name: fix.correctName,
        phone_number: fix.correctPhone,
        to_number: fix.correctPhone,
        updated_at: new Date().toISOString()
      })
      .eq('id', fix.callId);
      
    if (error) {
      console.error(`  ❌ Error:`, error);
    } else {
      console.log(`  ✅ Fixed!`);
    }
  }

  // Now verify the fix
  console.log('\n📊 Verifying fixes:');
  const { data: verifyData } = await client
    .from('calls')
    .select('id, customer_name, phone_number, vapi_call_id, recording_url')
    .in('id', ['a51ed739-21dc-4b66-99d6-d1f0b5482743', 'd6e2f853-3281-42ed-9f21-099f7a0f7b6a']);
    
  verifyData?.forEach(call => {
    console.log(`\n${call.customer_name} (${call.phone_number?.slice(-4)})`);
    console.log(`  Call ID: ${call.id}`);
    console.log(`  VAPI ID: ${call.vapi_call_id}`);
    console.log(`  Recording: ${call.recording_url ? 'Yes' : 'No'}`);
  });

  // Also need to make sure we have the correct VAPI recordings for each call
  console.log('\n🎯 Ensuring correct VAPI recordings...');
  
  // Re-sync VAPI data to make sure recordings match the actual calls
  const axios = require('axios');
  const { data: org } = await client
    .from('organizations')
    .select('vapi_private_key')
    .eq('id', '2566d8c5-2245-4a3c-b539-4cea21a07d9b')
    .single();
    
  const apiKey = org?.vapi_private_key;
  
  if (apiKey) {
    // Fetch correct recording for Sanya's call (503)
    try {
      const response = await axios.get(
        `https://api.vapi.ai/call/a50208cf-d904-4753-9737-848f18cdb0c2`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const vapiData = response.data;
      console.log('\nVAPI data for Sanya\'s call:');
      console.log('  Customer:', vapiData.customer?.number);
      console.log('  Recording:', vapiData.recordingUrl ? 'Available' : 'Not available');
      
      // This VAPI call should belong to Sean (716), not Sanya
      // Let's check which is the correct VAPI ID for each
      
    } catch (error) {
      console.error('Error fetching VAPI data:', error.message);
    }
  }
}

fixPhoneNumberMismatch().then(() => process.exit(0));