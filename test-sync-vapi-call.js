const axios = require('axios');
require('dotenv').config();

const VAPI_CALL_ID = '7d450632-6e20-4225-b0b5-f55c5e34754c'; // Correct VAPI call ID
const VAPI_API_KEY = 'da8956d4-0508-474e-bd96-7eda82d2d943'; // From your .env file

async function testSyncVAPICall() {
  try {
    console.log('🔍 Testing VAPI Call Sync for:', VAPI_CALL_ID);
    console.log('Using VAPI API Key:', VAPI_API_KEY.substring(0, 10) + '...');
    
    // First, fetch directly from VAPI
    console.log('\n📞 Fetching call from VAPI API...');
    const vapiResponse = await axios.get(`https://api.vapi.ai/call/${VAPI_CALL_ID}`, {
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    const call = vapiResponse.data;
    
    console.log('\n✅ VAPI Call Data Retrieved:');
    console.log('ID:', call.id);
    console.log('Status:', call.status);
    console.log('Type:', call.type);
    console.log('Started At:', call.startedAt);
    console.log('Ended At:', call.endedAt);
    console.log('Duration:', call.duration, 'seconds');
    console.log('Cost: $', call.cost);
    console.log('Ended Reason:', call.endedReason);
    
    if (call.transcript) {
      console.log('\n📝 Transcript:');
      console.log('Length:', call.transcript.length, 'characters');
      console.log('Preview:', call.transcript.substring(0, 200) + '...');
    } else {
      console.log('\n⚠️ No transcript available');
    }
    
    if (call.recordingUrl) {
      console.log('\n🎙️ Recording URL:', call.recordingUrl);
    }
    
    if (call.stereoRecordingUrl) {
      console.log('🎙️ Stereo Recording URL:', call.stereoRecordingUrl);
    }
    
    if (call.summary) {
      console.log('\n📋 Summary:', call.summary);
    }
    
    if (call.analysis) {
      console.log('\n🤖 Analysis:', JSON.stringify(call.analysis, null, 2));
    }
    
    // Show what would be updated in the database
    console.log('\n💾 Database Update Preview:');
    const updateData = {
      status: call.status === 'ended' ? 'completed' : call.status,
      duration: call.duration || 0,
      cost: call.cost || 0,
      recording_url: call.recordingUrl || call.stereoRecordingUrl,
      transcript: call.transcript,
      summary: call.summary,
      ended_at: call.endedAt,
      ended_reason: call.endedReason,
      metadata: {
        ...call,
        manually_synced: true,
        synced_at: new Date().toISOString()
      }
    };
    
    console.log('Status:', updateData.status);
    console.log('Duration:', updateData.duration);
    console.log('Cost:', updateData.cost);
    console.log('Has Recording:', !!updateData.recording_url);
    console.log('Has Transcript:', !!updateData.transcript);
    console.log('Has Summary:', !!updateData.summary);
    
    console.log('\n🎯 Next Steps:');
    console.log('1. Click the "Sync from VAPI" button in the CallDetails page');
    console.log('2. This will update your local database with the above data');
    console.log('3. If the call has a transcript, it will trigger AI processing');
    
  } catch (error) {
    console.error('\n❌ Error fetching VAPI call:', error.response?.data || error.message);
    if (error.response?.status === 404) {
      console.log('\n⚠️ Call not found in VAPI. This might mean:');
      console.log('- The call ID is incorrect');
      console.log('- The call was made with a different VAPI account');
      console.log('- The VAPI API key doesn\'t have access to this call');
    }
  }
}

testSyncVAPICall();