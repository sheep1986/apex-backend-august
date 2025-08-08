import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkVAPIWebhookLogs() {
  const callId = '8ea2bbfc-8bd3-4764-adf8-c71a11640881';
  console.log(`🔍 Checking VAPI webhook logs for call: ${callId}\n`);
  
  try {
    // First check if we have webhook logs table
    const { data: webhookLogs, error: logError } = await supabase
      .from('vapi_webhook_logs')
      .select('*')
      .eq('call_id', callId)
      .order('created_at', { ascending: true });
      
    if (logError) {
      console.log('No webhook logs table found or error:', logError.message);
      console.log('\nLet\'s check VAPI directly for call details...\n');
      
      // Get VAPI credentials
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('vapi_private_key')
        .eq('id', '2566d8c5-2245-4a3c-b539-4cea21a07d9b')
        .single();
        
      if (org?.vapi_private_key) {
        console.log('Found VAPI credentials, fetching call details...\n');
        
        const response = await fetch(`https://api.vapi.ai/v1/calls/${callId}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${org.vapi_private_key}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const callData = await response.json();
          console.log('VAPI Call Details:');
          console.log('=====================================');
          console.log(`Status: ${callData.status}`);
          console.log(`Type: ${callData.type}`);
          console.log(`Started: ${new Date(callData.startedAt).toLocaleString()}`);
          console.log(`Ended: ${new Date(callData.endedAt).toLocaleString()}`);
          console.log(`Duration: ${callData.duration} seconds`);
          console.log(`Cost: $${callData.cost}`);
          console.log(`Ended Reason: ${callData.endedReason}`);
          console.log(`Customer Number: ${callData.customer?.number || 'N/A'}`);
          console.log(`Phone Number Used: ${callData.phoneNumber?.number || 'N/A'}`);
          
          if (callData.messages) {
            console.log(`\nMessages/Events: ${callData.messages.length}`);
          }
          
          if (callData.transcript) {
            console.log('\nTranscript available: Yes');
            console.log(`Transcript length: ${callData.transcript.length} characters`);
          }
          
          if (callData.endedReason) {
            console.log(`\n⚠️  Call Ended Reason: "${callData.endedReason}"`);
            console.log('\nPossible reasons for "failed" outcome:');
            console.log('- Customer didn\'t answer');
            console.log('- Call was disconnected');
            console.log('- Technical issue');
            console.log('- Number not in service');
          }
          
          // Save the raw response for debugging
          console.log('\n\nRaw VAPI Response (first 500 chars):');
          console.log(JSON.stringify(callData, null, 2).substring(0, 500) + '...');
        } else {
          console.log('Error fetching from VAPI:', response.status, response.statusText);
        }
      }
    } else if (webhookLogs && webhookLogs.length > 0) {
      console.log(`Found ${webhookLogs.length} webhook logs:\n`);
      
      webhookLogs.forEach((log, index) => {
        console.log(`Log ${index + 1}:`);
        console.log(`Time: ${new Date(log.created_at).toLocaleString()}`);
        console.log(`Event: ${log.event_type || 'Unknown'}`);
        console.log(`Payload: ${JSON.stringify(log.payload || log).substring(0, 200)}...`);
        console.log('---\n');
      });
    } else {
      console.log('No webhook logs found for this call');
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

checkVAPIWebhookLogs();