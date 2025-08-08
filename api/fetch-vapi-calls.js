import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fetchVAPICallData() {
  const vapiCallIds = [
    { dbId: '15946e66-1bb2-4193-83ec-01b35aa2a837', vapiId: '060518f2-50f3-4664-8993-14d80c5b2df7' },
    { dbId: 'fdbfcfa2-7a01-4f7c-b162-95ca182f8f8f', vapiId: '2bd289f3-b2c6-4dc3-a3a4-f70b683d14e8' }
  ];
  
  console.log('🔍 Fetching VAPI call data...\n');
  
  try {
    // Get organization VAPI key
    const { data: org } = await supabase
      .from('organizations')
      .select('vapi_private_key')
      .eq('id', '2566d8c5-2245-4a3c-b539-4cea21a07d9b')
      .single();
      
    if (!org?.vapi_private_key) {
      console.error('No VAPI credentials found');
      return;
    }
    
    console.log('Found VAPI key:', org.vapi_private_key.substring(0, 10) + '...\n');
    
    for (const call of vapiCallIds) {
      console.log(`\n📞 Fetching VAPI call: ${call.vapiId}`);
      
      try {
        const response = await fetch(`https://api.vapi.ai/call/${call.vapiId}`, {
          headers: {
            'Authorization': `Bearer ${org.vapi_private_key}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const vapiData = await response.json();
          
          console.log('✅ VAPI Response:');
          console.log(`   Status: ${vapiData.status}`);
          console.log(`   Type: ${vapiData.type}`);
          console.log(`   Started: ${vapiData.startedAt ? new Date(vapiData.startedAt).toLocaleString() : 'Not started'}`);
          console.log(`   Ended: ${vapiData.endedAt ? new Date(vapiData.endedAt).toLocaleString() : 'Not ended'}`);
          console.log(`   Duration: ${vapiData.duration || 0} seconds`);
          console.log(`   Cost: $${vapiData.cost || 0}`);
          console.log(`   Ended Reason: ${vapiData.endedReason || 'N/A'}`);
          console.log(`   Customer: ${vapiData.customer?.number || 'Unknown'}`);
          console.log(`   Phone Used: ${vapiData.phoneNumber?.number || 'Unknown'}`);
          console.log(`   Has Transcript: ${vapiData.transcript ? 'Yes' : 'No'}`);
          console.log(`   Has Recording: ${vapiData.recordingUrl ? 'Yes' : 'No'}`);
          console.log(`   Messages: ${vapiData.messages?.length || 0}`);
          
          // Extract transcript
          let transcript = '';
          if (vapiData.transcript) {
            transcript = vapiData.transcript;
          } else if (vapiData.messages && vapiData.messages.length > 0) {
            transcript = vapiData.messages
              .filter(msg => msg.role === 'user' || msg.role === 'assistant')
              .map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.message || msg.content || ''}`)
              .join('\n');
          }
          
          // Extract customer info
          const customerPhone = vapiData.customer?.number || vapiData.customer?.phoneNumber;
          const customerName = vapiData.customer?.name || 'Matt'; // From your screenshot
          
          // Update our database with the VAPI data
          console.log('\n📝 Updating database...');
          
          const updateData = {
            status: vapiData.status === 'ended' ? 'completed' : vapiData.status,
            outcome: determineOutcome(vapiData),
            duration: vapiData.duration || 0,
            cost: vapiData.cost || 0,
            started_at: vapiData.startedAt || new Date().toISOString(),
            ended_at: vapiData.endedAt || new Date().toISOString(),
            transcript: transcript || null,
            recording_url: vapiData.recordingUrl || vapiData.recording?.url || null,
            customer_phone: customerPhone || '+35677161714',
            customer_name: customerName,
            updated_at: new Date().toISOString()
          };
          
          const { error: updateError } = await supabase
            .from('calls')
            .update(updateData)
            .eq('id', call.dbId);
            
          if (updateError) {
            console.error('❌ Error updating call:', updateError);
          } else {
            console.log('✅ Call updated successfully!');
            
            if (transcript) {
              console.log('\n📄 Transcript preview:');
              console.log(transcript.substring(0, 500) + '...');
            }
          }
          
        } else {
          console.log(`❌ VAPI Error: ${response.status} ${response.statusText}`);
          const errorText = await response.text();
          console.log('Error details:', errorText);
        }
      } catch (err) {
        console.error('Error fetching VAPI data:', err.message);
      }
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

function determineOutcome(vapiData) {
  const { status, endedReason, duration } = vapiData;
  
  if (status !== 'ended') {
    return 'in_progress';
  }
  
  // Check ended reason - using valid enum values from database
  switch (endedReason) {
    case 'customer-ended-call':
      return duration > 30 ? 'interested' : 'not_interested';
    case 'assistant-ended-call':
      // Assistant ended means conversation completed - need to check transcript for interest
      return 'interested'; // Will be updated by AI analysis
    case 'customer-did-not-answer':
      return 'no_answer';
    case 'voicemail':
      return 'voicemail';
    case 'customer-busy':
    case 'busy':
      return 'no_answer'; // Database doesn't have 'busy' enum
    default:
      return duration > 10 ? 'interested' : 'failed';
  }
}

fetchVAPICallData();