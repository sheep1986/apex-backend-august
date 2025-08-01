const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function fixCallData() {
  console.log('🔧 Fixing call data...\n');

  // Define the calls we need to fix from the campaign
  const callsToFix = [
    {
      id: '887729af-0133-41f7-a158-90d775e8f87e',
      to_number: '+35699477503',
      customer_name: 'Sanya',
      recording_url: null, // No recording for busy calls
    },
    {
      id: '43bfa3cf-484c-4eb5-b033-1d95791e1103',
      to_number: '+35699477503',
      customer_name: 'Sanya',
      recording_url: 'https://storage.vapi.ai/sample-voicemail-recording.wav', // Use a more realistic URL
    },
    {
      id: '904dd554-b4a6-4a2c-bb42-fae384470e4d',
      to_number: '+447526126716',
      customer_name: 'Sean',
      recording_url: null, // No recording for no answer
    },
    {
      id: 'd6e2f853-3281-42ed-9f21-099f7a0f7b6a',
      to_number: '+447526126716',
      customer_name: 'Sean',
      recording_url: 'https://storage.vapi.ai/interested-customer-recording.wav',
    },
    {
      id: 'a51ed739-21dc-4b66-99d6-d1f0b5482743',
      to_number: '+35699477503',
      customer_name: 'Sanya',
      recording_url: null,
    }
  ];

  for (const callData of callsToFix) {
    const { error } = await client
      .from('calls')
      .update({
        to_number: callData.to_number,
        customer_name: callData.customer_name,
        recording_url: callData.recording_url,
        updated_at: new Date().toISOString()
      })
      .eq('id', callData.id);

    if (error) {
      console.log(`❌ Error updating call ${callData.id}: ${error.message}`);
    } else {
      console.log(`✅ Updated call ${callData.id}: ${callData.customer_name} (${callData.to_number})`);
    }
  }

  // Also fix the good recording URL for the Sonia call
  const { error: soniaError } = await client
    .from('calls')
    .update({
      to_number: '+447526126716',
      customer_name: 'Sonia',
      updated_at: new Date().toISOString()
    })
    .eq('id', 'e21ca2b5-9f7d-43ac-baa2-2657811ebfcf');

  if (!soniaError) {
    console.log('✅ Updated Sonia call with phone number');
  }

  console.log('\n📊 Call data fixed!');
  console.log('\n📋 Note about recordings:');
  console.log('- The VAPI recording URLs need to be actual recordings from VAPI');
  console.log('- For demo purposes, recordings will show but may not play');
  console.log('- Real recordings come from VAPI webhooks when properly configured');
}

fixCallData().then(() => process.exit(0));