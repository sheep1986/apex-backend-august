import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function showMattTranscript() {
  const callId = 'fdbfcfa2-7a01-4f7c-b162-95ca182f8f8f';
  
  console.log(`📄 Matt's Call Transcript\n`);
  console.log('=' .repeat(60) + '\n');
  
  try {
    const { data: call } = await supabase
      .from('calls')
      .select('transcript, recording_url')
      .eq('id', callId)
      .single();
      
    if (call.transcript) {
      console.log(call.transcript);
      console.log('\n' + '=' .repeat(60));
      console.log('\n🎧 Recording URL:');
      console.log(call.recording_url);
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

showMattTranscript();