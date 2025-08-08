import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSpecificCalls() {
  // Call IDs from your screenshot
  const callIds = [
    '15946e66-1bb2-4193-83ec-01b35aa2a837',
    'fdbfcfa2-7a01-4f7c-b162-95ca182f8f8f'
  ];
  
  console.log('🔍 Checking specific calls...\n');
  
  try {
    for (const callId of callIds) {
      const { data: call, error } = await supabase
        .from('calls')
        .select('*')
        .eq('id', callId)
        .single();
        
      if (error) {
        console.error(`Error fetching call ${callId}:`, error);
        continue;
      }
      
      console.log(`\n📞 Call: ${call.id}`);
      console.log(`   Customer: ${call.customer_name || 'Unknown'}`);
      console.log(`   Phone: ${call.customer_phone || call.to_number || 'Unknown'}`);
      console.log(`   Status: ${call.status}`);
      console.log(`   Outcome: ${call.outcome}`);
      console.log(`   Duration: ${call.duration}s`);
      console.log(`   Cost: $${call.cost || 0}`);
      console.log(`   VAPI ID: ${call.vapi_call_id}`);
      console.log(`   Created: ${new Date(call.created_at).toLocaleString()}`);
      console.log(`   Updated: ${new Date(call.updated_at).toLocaleString()}`);
      console.log(`   Has transcript: ${call.transcript ? 'Yes (' + call.transcript.length + ' chars)' : 'No'}`);
      console.log(`   Has recording: ${call.recording_url ? 'Yes' : 'No'}`);
      console.log(`   AI Score: ${call.ai_confidence_score || 'Not set'}`);
      console.log(`   Sentiment: ${call.sentiment || 'Not analyzed'}`);
      
      // Check why it might be showing "In Progress"
      if (call.status === 'completed' && !call.transcript) {
        console.log(`   ⚠️  Status is completed but no transcript - needs fetching from VAPI`);
      }
      
      if (call.status === 'processing') {
        console.log(`   ⚠️  Still in processing status - may be stuck`);
      }
      
      if (!call.outcome || call.outcome === 'unknown') {
        console.log(`   ⚠️  Outcome not determined`);
      }
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

checkSpecificCalls();