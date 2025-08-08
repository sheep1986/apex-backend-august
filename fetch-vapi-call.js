const axios = require('axios');
require('dotenv').config();

async function fetchVAPICall(callId) {
  try {
    console.log('🔍 Fetching call from VAPI:', callId);
    
    // Get VAPI API key from environment or organization settings
    const VAPI_API_KEY = process.env.VAPI_API_KEY || 'da8956d4-0aa7-4a15-a1e9-2cc0c1c87b15'; // Your org's VAPI key
    
    // VAPI API endpoint to get call by ID
    const response = await axios.get(`https://api.vapi.ai/call/${callId}`, {
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    const call = response.data;
    
    console.log('\n📞 VAPI Call Data:');
    console.log('ID:', call.id);
    console.log('Status:', call.status);
    console.log('Type:', call.type);
    console.log('Started At:', call.startedAt);
    console.log('Ended At:', call.endedAt);
    console.log('Duration:', call.duration);
    console.log('Cost:', call.cost);
    console.log('Ended Reason:', call.endedReason);
    
    if (call.transcript) {
      console.log('\n📝 Transcript Available:', call.transcript.length, 'characters');
      console.log('First 200 chars:', call.transcript.substring(0, 200) + '...');
    }
    
    if (call.recordingUrl) {
      console.log('\n🎙️ Recording URL:', call.recordingUrl);
    }
    
    if (call.summary) {
      console.log('\n📋 Summary:', call.summary);
    }
    
    if (call.analysis) {
      console.log('\n🤖 Analysis:', JSON.stringify(call.analysis, null, 2));
    }
    
    // Now update the local database with this data
    console.log('\n💾 Updating local database...');
    await updateLocalCall(callId, call);
    
  } catch (error) {
    console.error('❌ Error fetching VAPI call:', error.response?.data || error.message);
  }
}

async function updateLocalCall(callId, vapiData) {
  const { createClient } = require('@supabase/supabase-js');
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  
  try {
    const updateData = {
      status: vapiData.status === 'ended' ? 'completed' : vapiData.status,
      duration: vapiData.duration || 0,
      cost: vapiData.cost || 0,
      recording_url: vapiData.recordingUrl,
      transcript: vapiData.transcript,
      summary: vapiData.summary,
      ended_at: vapiData.endedAt,
      metadata: {
        ...vapiData,
        manually_synced: true,
        synced_at: new Date().toISOString()
      },
      updated_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
      .from('calls')
      .update(updateData)
      .eq('vapi_call_id', callId);
    
    if (error) {
      console.error('❌ Error updating local call:', error);
    } else {
      console.log('✅ Local call updated successfully');
      
      // Trigger AI processing if transcript is available
      if (vapiData.transcript && vapiData.status === 'ended') {
        console.log('\n🤖 Triggering AI processing...');
        // The AI processing would normally be triggered here
      }
    }
    
  } catch (error) {
    console.error('❌ Error updating database:', error);
  }
}

// Get the VAPI call ID from your call
const vapiCallId = process.argv[2] || 'e21ca2b5-9f7d-43ac-baa2-2657811ebfcf';
fetchVAPICall(vapiCallId);