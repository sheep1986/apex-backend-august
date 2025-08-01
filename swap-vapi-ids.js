const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function swapVapiIds() {
  console.log('🔄 Swapping VAPI IDs to fix mismatches...\n');

  // First, let's null out the VAPI IDs we need to swap
  const call1 = 'a51ed739-21dc-4b66-99d6-d1f0b5482743'; // Sean call that currently has Sanya's VAPI ID
  const call2 = 'd6e2f853-3281-42ed-9f21-099f7a0f7b6a'; // Sanya call that currently has Sean's VAPI ID
  
  // Step 1: Set VAPI IDs to null temporarily
  console.log('Step 1: Clearing VAPI IDs...');
  
  await client
    .from('calls')
    .update({ vapi_call_id: null })
    .eq('id', call1);
    
  await client
    .from('calls')
    .update({ vapi_call_id: null })
    .eq('id', call2);
    
  console.log('✅ VAPI IDs cleared');
  
  // Step 2: Re-sync from VAPI to get correct data
  console.log('\nStep 2: Re-syncing with correct VAPI data...');
  
  // For Sean's call (716) - should use VAPI ID a50208cf...
  const { error: error1 } = await client
    .from('calls')
    .update({
      vapi_call_id: 'a50208cf-d904-4753-9737-848f18cdb0c2',
      customer_name: 'Sean',
      phone_number: '+447526126716',
      to_number: '+447526126716',
      recording_url: 'https://storage.vapi.ai/a50208cf-d904-4753-9737-848f18cdb0c2-1732999848206-39c4fb3f-d9f8-4adf-beab-cdecd7b968f4-mono.wav',
      transcript: `User: There. You've come through to Sean at Artificial Studios. Please leave a message and I'll get back to you. Thank you.
AI: Hi Sean, this is Sarah from TechVentures calling. I wanted to discuss an exciting opportunity about your AI calling solution. I've been researching companies in the voice AI space and Artificial Studios really caught my attention. I believe we could be a great fit for your platform. 

I'd love to schedule a brief call to learn more about your capabilities and discuss how we might work together. I'm particularly interested in your campaign management features and integration options. 

Please give me a call back when you have a chance. You can reach me at 555-0123. I'm generally available Tuesday through Thursday afternoons. Looking forward to connecting with you soon. Thanks and have a great day!`,
      duration: 79,
      cost: 0.1375,
      updated_at: new Date().toISOString()
    })
    .eq('id', call2); // This is now Sean's call
    
  if (error1) {
    console.error('❌ Error updating Sean\'s call:', error1);
  } else {
    console.log('✅ Updated Sean\'s call with correct VAPI data');
  }
  
  // For Sanya's call (503) - should use VAPI ID 7467f610... (no recording)
  const { error: error2 } = await client
    .from('calls')
    .update({
      vapi_call_id: '7467f610-5793-44f0-8091-61daaa38f3ea',
      customer_name: 'Sanya',
      phone_number: '+35699477503',
      to_number: '+35699477503',
      recording_url: null, // This call has no recording
      transcript: null, // This call has no transcript
      duration: 0,
      cost: 0,
      updated_at: new Date().toISOString()
    })
    .eq('id', call1); // This is now Sanya's call
    
  if (error2) {
    console.error('❌ Error updating Sanya\'s call:', error2);
  } else {
    console.log('✅ Updated Sanya\'s call (no recording)');
  }
  
  // Step 3: Verify the fix
  console.log('\n📊 Verifying the fix:');
  const { data: verifyData } = await client
    .from('calls')
    .select('id, customer_name, phone_number, vapi_call_id, recording_url, duration')
    .eq('campaign_id', '7227d85d-ab92-4859-abc0-8b017e19a942')
    .order('created_at');
    
  verifyData?.forEach(call => {
    console.log(`\n${call.customer_name} (${call.phone_number})`);
    console.log(`  Duration: ${call.duration}s`);
    console.log(`  Recording: ${call.recording_url ? 'Yes' : 'No'}`);
  });
}

swapVapiIds().then(() => process.exit(0));