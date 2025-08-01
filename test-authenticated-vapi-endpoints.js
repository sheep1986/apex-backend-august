require('dotenv').config();
const https = require('https');

async function testAuthenticatedEndpoints() {
  try {
    console.log('🔍 Testing Authenticated VAPI Endpoints');
    console.log('=======================================\n');

    // Create a test JWT token (this won't work for real auth, but shows the format)
    const testToken = 'Bearer test-token';

    // Test assistants endpoint
    console.log('📞 Testing /api/vapi-data/assistants...');
    
    const assistantsResult = await makeRequest('localhost', 3001, '/api/vapi-data/assistants', testToken);
    console.log('Response Status:', assistantsResult.status);
    console.log('Response Body:', JSON.stringify(assistantsResult.data, null, 2));

    console.log('\n📱 Testing /api/vapi-data/phone-numbers...');
    
    const phoneNumbersResult = await makeRequest('localhost', 3001, '/api/vapi-data/phone-numbers', testToken);
    console.log('Response Status:', phoneNumbersResult.status);
    console.log('Response Body:', JSON.stringify(phoneNumbersResult.data, null, 2));

  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

function makeRequest(hostname, port, path, authHeader) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      port,
      path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            status: res.statusCode,
            data: jsonData
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: data
          });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

// Run the test
testAuthenticatedEndpoints();