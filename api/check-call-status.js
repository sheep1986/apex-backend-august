import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCallStatus() {
  console.log('🔍 Checking call with duration 262 and cost 0.6196...\n');
  
  try {
    // Find the specific call we're investigating
    const { data: calls, error } = await supabase
      .from('calls')
      .select(`
        id,
        vapi_call_id,
        status,
        outcome,
        duration,
        cost,
        started_at,
        ended_at,
        transcript,
        recording,
        lead_id,
        campaign_id,
        sentiment,
        qualification_status,
        lead_score,
        leads!calls_lead_id_fkey(first_name, last_name, phone)
      `)
      .eq('duration', 262)
      .gte('cost', 0.61)
      .lte('cost', 0.62);
      
    if (error) {
      console.error('Error fetching call:', error);
      return;
    }
    
    if (!calls || calls.length === 0) {
      console.log('No calls found with duration 262 and cost ~0.6196');
      return;
    }
    
    console.log(`Found ${calls.length} matching call(s):\n`);
    
    calls.forEach((call, index) => {
      console.log(`Call ${index + 1}:`);
      console.log('=====================================');
      console.log(`ID: ${call.id}`);
      console.log(`VAPI Call ID: ${call.vapi_call_id}`);
      console.log(`Status: ${call.status}`);
      console.log(`Outcome: ${call.outcome}`);
      console.log(`Duration: ${call.duration} seconds`);
      console.log(`Cost: $${call.cost}`);
      console.log(`Started: ${new Date(call.started_at).toLocaleString()}`);
      console.log(`Ended: ${new Date(call.ended_at).toLocaleString()}`);
      console.log(`Customer: ${call.leads?.first_name} ${call.leads?.last_name} (${call.leads?.phone})`);
      console.log(`Sentiment: ${call.sentiment || 'Not analyzed'}`);
      console.log(`Qualification: ${call.qualification_status || 'Not set'}`);
      console.log(`Lead Score: ${call.lead_score || 'Not scored'}`);
      console.log(`Has Recording: ${call.recording ? 'Yes' : 'No'}`);
      console.log(`Has Transcript: ${call.transcript ? 'Yes (' + call.transcript.length + ' chars)' : 'No'}`);
      
      if (call.transcript) {
        console.log('\nTranscript Preview:');
        console.log('-------------------');
        console.log(call.transcript.substring(0, 200) + '...');
      }
      
      console.log('\n');
    });
    
    // Let's also check the raw webhook data if available
    console.log('\n📊 Checking for raw webhook data...');
    
    if (calls[0]?.vapi_call_id) {
      const { data: webhookData, error: webhookError } = await supabase
        .from('vapi_webhook_logs')
        .select('*')
        .eq('call_id', calls[0].vapi_call_id)
        .order('created_at', { ascending: false })
        .limit(5);
        
      if (webhookData && webhookData.length > 0) {
        console.log(`\nFound ${webhookData.length} webhook log(s) for this call:`);
        webhookData.forEach((log, index) => {
          console.log(`\nWebhook ${index + 1}:`);
          console.log(`Event: ${log.event_type}`);
          console.log(`Time: ${new Date(log.created_at).toLocaleString()}`);
          if (log.payload) {
            console.log(`Payload preview: ${JSON.stringify(log.payload).substring(0, 200)}...`);
          }
        });
      }
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

checkCallStatus();