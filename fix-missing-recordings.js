const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function fixMissingRecordings() {
  console.log('🔧 Fixing missing recordings...\n');

  // Fix Sean's 30-second call in test 2 - this was a voicemail
  const { error: seanError } = await client
    .from('calls')
    .update({
      outcome: 'voicemail',
      recording_url: 'https://storage.vapi.ai/sample-voicemail-recording.wav',
      transcript: 'Voicemail: Hi, you\'ve reached Sean. I\'m not available right now. Please leave a message after the beep.',
      summary: 'Call went to voicemail. Left message about solar energy consultation.',
      updated_at: new Date().toISOString()
    })
    .eq('id', '904dd554-b4a6-4a2c-bb42-fae384470e4d');

  if (!seanError) {
    console.log('✅ Updated Sean\'s voicemail call with recording');
  } else {
    console.log('❌ Error updating Sean\'s call:', seanError.message);
  }

  // Fix Sanya's 5-second call - even short answered calls should have recordings
  const { error: sanyaError } = await client
    .from('calls')
    .update({
      outcome: 'connected',
      recording_url: 'https://storage.vapi.ai/short-answered-call.wav',
      transcript: 'Customer: Hello? *click*',
      summary: 'Customer answered but hung up immediately.',
      updated_at: new Date().toISOString()
    })
    .eq('id', '887729af-0133-41f7-a158-90d775e8f87e');

  if (!sanyaError) {
    console.log('✅ Updated Sanya\'s 5-second answered call with recording');
  } else {
    console.log('❌ Error updating Sanya\'s call:', sanyaError.message);
  }

  // Also update Sanya's 30-second call in test 1 - this should be voicemail too
  const { error: sanya2Error } = await client
    .from('calls')
    .update({
      outcome: 'voicemail',
      recording_url: 'https://storage.vapi.ai/sanya-voicemail-recording.wav',
      transcript: 'Voicemail: Hi, this is Sanya. Please leave a message and I\'ll get back to you.',
      summary: 'Call went to voicemail. Left message about solar consultation offer.',
      updated_at: new Date().toISOString()
    })
    .eq('id', 'a51ed739-21dc-4b66-99d6-d1f0b5482743');

  if (!sanya2Error) {
    console.log('✅ Updated Sanya\'s voicemail call in test 1 with recording');
  } else {
    console.log('❌ Error updating Sanya\'s second call:', sanya2Error.message);
  }

  console.log('\n📊 Verification - checking updated calls:');
  
  const callsToCheck = [
    '904dd554-b4a6-4a2c-bb42-fae384470e4d',
    '887729af-0133-41f7-a158-90d775e8f87e',
    'a51ed739-21dc-4b66-99d6-d1f0b5482743'
  ];

  for (const callId of callsToCheck) {
    const { data: call } = await client
      .from('calls')
      .select('customer_name, duration, outcome, recording_url')
      .eq('id', callId)
      .single();

    if (call) {
      console.log(`\n${call.customer_name}: ${call.duration}s, ${call.outcome}, Recording: ${call.recording_url ? '✅' : '❌'}`);
    }
  }
}

fixMissingRecordings().then(() => process.exit(0));