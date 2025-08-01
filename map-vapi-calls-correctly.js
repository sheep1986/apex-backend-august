const supabase = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function mapVapiCallsCorrectly() {
  console.log('🔍 Mapping VAPI calls to correct database records...\n');

  // Get VAPI API key
  const { data: org } = await client
    .from('organizations')
    .select('vapi_private_key')
    .eq('id', '2566d8c5-2245-4a3c-b539-4cea21a07d9b')
    .single();
    
  const apiKey = org?.vapi_private_key;
  if (!apiKey) {
    console.error('No VAPI API key found');
    return;
  }

  // Get all calls with VAPI IDs
  const { data: calls } = await client
    .from('calls')
    .select('*')
    .not('vapi_call_id', 'is', null);

  console.log('Checking each VAPI call to find correct mappings...\n');

  const vapiToPhoneMap = {};
  
  // Check each VAPI call to see which phone number it actually belongs to
  for (const call of calls || []) {
    try {
      const response = await axios.get(
        `https://api.vapi.ai/call/${call.vapi_call_id}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const vapiData = response.data;
      const actualPhone = vapiData.customer?.number;
      
      vapiToPhoneMap[call.vapi_call_id] = {
        actualPhone,
        currentCallId: call.id,
        currentPhone: call.phone_number,
        currentName: call.customer_name,
        hasRecording: !!vapiData.recordingUrl,
        recordingUrl: vapiData.recordingUrl || vapiData.stereoRecordingUrl
      };
      
      console.log(`VAPI ${call.vapi_call_id.substring(0, 8)}...`);
      console.log(`  Actual phone from VAPI: ${actualPhone}`);
      console.log(`  Current DB phone: ${call.phone_number}`);
      console.log(`  Current DB name: ${call.customer_name}`);
      console.log(`  Has recording: ${!!vapiData.recordingUrl}`);
      
      if (actualPhone !== call.phone_number) {
        console.log(`  ⚠️  MISMATCH DETECTED!`);
      }
      console.log('');
      
    } catch (error) {
      console.error(`Error fetching VAPI call ${call.vapi_call_id}:`, error.message);
    }
  }

  // Now fix the mismatches
  console.log('\n🔧 Fixing mismatches...\n');
  
  // For test 1 campaign, we need to swap the VAPI IDs
  const test1Fixes = [
    {
      callId: 'a51ed739-21dc-4b66-99d6-d1f0b5482743', // Currently has VAPI ID a50208cf... which is for 716
      correctVapiId: '7467f610-5793-44f0-8091-61daaa38f3ea', // This one has no recording and is for 7503
      correctName: 'Sanya',
      correctPhone: '+35699477503'
    },
    {
      callId: 'd6e2f853-3281-42ed-9f21-099f7a0f7b6a', // Currently has VAPI ID 7467f610... which is for 7503  
      correctVapiId: 'a50208cf-d904-4753-9737-848f18cdb0c2', // This one has recording and is for 716
      correctName: 'Sean',
      correctPhone: '+447526126716'
    }
  ];

  for (const fix of test1Fixes) {
    console.log(`Fixing call ${fix.callId}:`);
    console.log(`  Setting VAPI ID to: ${fix.correctVapiId}`);
    console.log(`  Setting name to: ${fix.correctName}`);
    console.log(`  Setting phone to: ${fix.correctPhone}`);
    
    // Get the recording URL from the correct VAPI call
    const vapiInfo = vapiToPhoneMap[fix.correctVapiId];
    
    const { error } = await client
      .from('calls')
      .update({
        vapi_call_id: fix.correctVapiId,
        customer_name: fix.correctName,
        phone_number: fix.correctPhone,
        to_number: fix.correctPhone,
        recording_url: vapiInfo?.recordingUrl || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', fix.callId);
      
    if (error) {
      console.error(`  ❌ Error:`, error);
    } else {
      console.log(`  ✅ Fixed! Recording: ${vapiInfo?.hasRecording ? 'Yes' : 'No'}`);
    }
  }
}

mapVapiCallsCorrectly().then(() => process.exit(0));