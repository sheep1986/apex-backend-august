// Test script to check API transcript response
import 'dotenv/config';

const callId = 'fdbfcfa2-7a01-4f7c-b162-95ca182f8f8f';
const apiUrl = `http://localhost:3001/api/vapi-outbound/calls/${callId}`;

console.log('🔍 Testing API endpoint:', apiUrl);

try {
  const response = await fetch(apiUrl, {
    headers: {
      'Content-Type': 'application/json',
      // Add auth headers if needed
    }
  });

  if (!response.ok) {
    console.error('❌ API Error:', response.status, response.statusText);
    const errorText = await response.text();
    console.error('Error details:', errorText);
  } else {
    const data = await response.json();
    console.log('\n✅ API Response received');
    console.log('Has call data:', !!data.call);
    
    if (data.call) {
      console.log('\nCall details:');
      console.log('- ID:', data.call.id);
      console.log('- Status:', data.call.status);
      console.log('- Duration:', data.call.duration);
      console.log('- Has transcript:', !!data.call.transcript);
      
      if (data.call.transcript) {
        console.log('- Transcript type:', typeof data.call.transcript);
        console.log('- Transcript length:', data.call.transcript.length);
        console.log('\n📝 First 200 chars of transcript:');
        console.log(data.call.transcript.substring(0, 200) + '...');
      } else {
        console.log('❌ NO TRANSCRIPT IN API RESPONSE!');
      }
    }
  }
} catch (error) {
  console.error('❌ Error testing API:', error.message);
  console.error('Make sure the backend is running on port 3001');
}