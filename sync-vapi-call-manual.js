const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function syncVAPICall() {
  const callId = 'e21ca2b5-9f7d-43ac-baa2-2657811ebfcf';
  const vapiCallId = '7d450632-6e20-4225-b0b5-f55c5e34754c';
  const orgId = '2566d8c5-2245-4a3c-b539-4cea21a07d9b';
  
  // Get VAPI credentials
  const { data: org } = await supabase
    .from('organizations')
    .select('vapi_private_key, settings')
    .eq('id', orgId)
    .single();
    
  const vapiApiKey = org.vapi_private_key || org.settings?.vapi?.privateKey;
  console.log('Using VAPI key:', vapiApiKey ? vapiApiKey.substring(0, 10) + '...' : 'None');
  
  if (!vapiApiKey) {
    console.error('No VAPI API key found');
    return;
  }
  
  try {
    // Fetch from VAPI
    console.log('Fetching call from VAPI...');
    const response = await axios.get(`https://api.vapi.ai/call/${vapiCallId}`, {
      headers: {
        'Authorization': `Bearer ${vapiApiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    const vapiCall = response.data;
    console.log('VAPI Response:', {
      id: vapiCall.id,
      status: vapiCall.status,
      duration: vapiCall.duration,
      endedReason: vapiCall.endedReason,
      recordingUrl: vapiCall.recordingUrl,
      stereoRecordingUrl: vapiCall.stereoRecordingUrl,
      hasTranscript: !!vapiCall.transcript
    });
    
    // Calculate duration from timestamps
    let duration = 0;
    if (vapiCall.startedAt && vapiCall.endedAt) {
      const start = new Date(vapiCall.startedAt);
      const end = new Date(vapiCall.endedAt);
      duration = Math.round((end - start) / 1000); // duration in seconds
    }
    
    // Update our database
    const updateData = {
      status: vapiCall.status === 'ended' ? 'completed' : vapiCall.status,
      duration: duration,
      cost: vapiCall.cost || 0,
      recording_url: vapiCall.recordingUrl || vapiCall.stereoRecordingUrl,
      transcript: vapiCall.transcript,
      summary: vapiCall.summary,
      ended_at: vapiCall.endedAt,
      outcome: null, // Will be set by AI processing
      metadata: JSON.stringify(vapiCall),
      updated_at: new Date().toISOString()
    };
    
    const { error } = await supabase
      .from('calls')
      .update(updateData)
      .eq('id', callId);
      
    if (error) {
      console.error('Update error:', error);
    } else {
      console.log('✅ Call updated successfully');
      
      // Trigger AI processing if completed
      if (vapiCall.status === 'ended' && vapiCall.transcript) {
        console.log('Call has transcript - would trigger AI processing');
        console.log('Transcript preview:', vapiCall.transcript.substring(0, 200) + '...');
      }
    }
    
  } catch (error) {
    console.error('VAPI API error:', error.response?.data || error.message);
  }
}

syncVAPICall();