const axios = require('axios');

async function testCampaignCalls() {
  try {
    const campaignId = '17a2fb03-a4f4-4743-8b06-38961fd3a4f2';
    const response = await axios.get(
      `http://localhost:3001/api/vapi-outbound/campaigns/${campaignId}/calls`,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('📊 Campaign Calls Response:');
    console.log(`Total calls: ${response.data.calls.length}`);
    console.log('\nFirst 3 calls:');
    
    response.data.calls.slice(0, 3).forEach((call, index) => {
      console.log(`\n📞 Call ${index + 1}:`);
      console.log(`  ID: ${call.id}`);
      console.log(`  Customer: ${call.customerName}`);
      console.log(`  Duration: ${call.duration}s`);
      console.log(`  Status: ${call.status}`);
      console.log(`  Recording: ${call.recording || 'NO RECORDING'}`);
      console.log(`  Has Recording: ${call.hasRecording}`);
      console.log(`  Has Transcript: ${call.hasTranscript}`);
    });
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testCampaignCalls();