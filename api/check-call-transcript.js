import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCallTranscript() {
  const callId = 'd69543b9-01d3-4279-b81d-2cd621a2024c';
  console.log(`🔍 Checking transcript for call ${callId}...\n`);
  
  try {
    const { data: call, error } = await supabase
      .from('calls')
      .select('id, transcript, outcome, duration, sentiment, qualification_status, ai_recommendation')
      .eq('id', callId)
      .single();
      
    if (error) {
      console.error('Error fetching call:', error);
      return;
    }
    
    console.log('Call data:');
    console.log(`- Has transcript: ${call.transcript ? 'Yes' : 'No'}`);
    console.log(`- Transcript length: ${call.transcript ? call.transcript.length : 0} characters`);
    console.log(`- Current outcome: ${call.outcome}`);
    console.log(`- Sentiment: ${call.sentiment || 'Not analyzed'}`);
    console.log(`- Qualification status: ${call.qualification_status || 'Not set'}`);
    console.log(`- AI recommendation: ${call.ai_recommendation || 'None'}`);
    
    if (call.transcript) {
      console.log('\nTranscript preview:');
      console.log('=================');
      console.log(call.transcript.substring(0, 500) + '...');
    } else {
      console.log('\n⚠️  No transcript found for this call');
      console.log('Cannot determine interest level without transcript');
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

checkCallTranscript();