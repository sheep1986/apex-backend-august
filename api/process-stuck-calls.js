import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function processStuckCalls() {
  console.log('🔍 Looking for stuck calls in processing status...\n');
  
  try {
    // Find calls stuck in processing
    const { data: stuckCalls, error } = await supabase
      .from('calls')
      .select('*')
      .eq('status', 'processing')
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('Error fetching calls:', error);
      return;
    }
    
    console.log(`Found ${stuckCalls.length} stuck calls\n`);
    
    for (const call of stuckCalls) {
      console.log(`\n📞 Processing call: ${call.id}`);
      console.log(`   Customer: ${call.customer_name || 'Unknown'}`);
      console.log(`   VAPI ID: ${call.vapi_call_id}`);
      console.log(`   Created: ${new Date(call.created_at).toLocaleString()}`);
      console.log(`   Has transcript: ${call.transcript ? 'Yes' : 'No'}`);
      
      if (!call.vapi_call_id) {
        console.log('   ❌ No VAPI ID - skipping');
        continue;
      }
      
      // Get organization's VAPI credentials
      const { data: org } = await supabase
        .from('organizations')
        .select('vapi_private_key')
        .eq('id', call.organization_id)
        .single();
        
      if (!org?.vapi_private_key) {
        console.log('   ❌ No VAPI credentials found');
        continue;
      }
      
      try {
        // Fetch from VAPI
        console.log('   📡 Fetching from VAPI...');
        const response = await fetch(`https://api.vapi.ai/call/${call.vapi_call_id}`, {
          headers: {
            'Authorization': `Bearer ${org.vapi_private_key}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const vapiData = await response.json();
          console.log('   ✅ VAPI data received');
          
          // Extract transcript
          let transcript = '';
          if (vapiData.transcript) {
            transcript = vapiData.transcript;
          } else if (vapiData.messages && Array.isArray(vapiData.messages)) {
            transcript = vapiData.messages
              .filter(msg => msg.role === 'user' || msg.role === 'assistant')
              .map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.message || msg.content || ''}`)
              .join('\n');
          }
          
          // Extract recording
          const recordingUrl = vapiData.recordingUrl || vapiData.recording?.url || vapiData.stereoRecordingUrl;
          
          console.log(`   Has transcript: ${transcript ? 'Yes (' + transcript.length + ' chars)' : 'No'}`);
          console.log(`   Has recording: ${recordingUrl ? 'Yes' : 'No'}`);
          
          // Update the call
          const updateData = {
            transcript: transcript || call.transcript,
            recording_url: recordingUrl || call.recording_url,
            duration: vapiData.duration || call.duration,
            cost: vapiData.cost || call.cost,
            status: 'completed',
            updated_at: new Date().toISOString()
          };
          
          const { error: updateError } = await supabase
            .from('calls')
            .update(updateData)
            .eq('id', call.id);
            
          if (updateError) {
            console.error('   ❌ Error updating call:', updateError);
          } else {
            console.log('   ✅ Call updated successfully');
            
            // If we have a transcript, trigger AI processing
            if (transcript && !call.ai_confidence_score) {
              console.log('   🤖 Triggering AI analysis...');
              
              console.log('   📋 Transcript ready for AI analysis');
            }
          }
        } else {
          console.log(`   ❌ VAPI error: ${response.status} ${response.statusText}`);
          
          // If VAPI call not found, just mark as completed
          if (response.status === 404) {
            await supabase
              .from('calls')
              .update({
                status: 'completed',
                outcome: call.outcome || 'unknown',
                updated_at: new Date().toISOString()
              })
              .eq('id', call.id);
              
            console.log('   ⚠️  Call not found in VAPI - marked as completed');
          }
        }
      } catch (err) {
        console.error('   ❌ Error processing call:', err.message);
      }
    }
    
    console.log('\n✅ Processing complete!');
    
  } catch (err) {
    console.error('Error:', err);
  }
}

processStuckCalls();