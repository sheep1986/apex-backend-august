import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

async function testAPICallEndpoint() {
  const callId = 'fdbfcfa2-7a01-4f7c-b162-95ca182f8f8f';
  const apiUrl = `http://localhost:3001/api/vapi-outbound/calls/${callId}`;
  
  console.log(`🔍 Testing API endpoint: ${apiUrl}\n`);
  
  try {
    // Get a valid auth token (you might need to adjust this based on your auth setup)
    const authToken = process.env.TEST_AUTH_TOKEN || 'test-token';
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Response Status: ${response.status} ${response.statusText}\n`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('API Response:');
      console.log('=====================================');
      console.log(`Has call data: ${!!data.call}`);
      console.log(`Call ID: ${data.call?.id}`);
      console.log(`Customer: ${data.call?.customerName}`);
      console.log(`Duration: ${data.call?.duration}`);
      console.log(`Has transcript: ${!!data.call?.transcript}`);
      console.log(`Transcript type: ${typeof data.call?.transcript}`);
      console.log(`Transcript length: ${data.call?.transcript?.length || 0}`);
      console.log(`Recording URL: ${data.call?.recording || 'Not found'}`);
      
      if (data.call?.transcript) {
        console.log('\nTranscript preview:');
        console.log(data.call.transcript.substring(0, 200) + '...');
      } else {
        console.log('\n❌ No transcript in API response!');
      }
    } else {
      const errorText = await response.text();
      console.log('Error response:', errorText);
    }
    
  } catch (err) {
    console.error('Error testing API:', err.message);
    console.log('\nMake sure the backend is running on port 3001');
  }
}

testAPICallEndpoint();