// Test what the frontend API client is actually receiving
require('dotenv').config();
const https = require('https');

async function testFrontendAPI() {
  console.log('🧪 Testing what the frontend sees...');
  
  const endpoints = [
    '/api/vapi-outbound/campaigns',
    '/api/calls',
    '/api/platform-analytics/overview'
  ];
  
  for (const endpoint of endpoints) {
    console.log(`\n📞 Testing: ${endpoint}`);
    
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: endpoint,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-token',
        'Content-Type': 'application/json'
      }
    };
    
    try {
      const response = await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = '';
          
          res.on('data', (chunk) => {
            data += chunk;
          });
          
          res.on('end', () => {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              data: data
            });
          });
        });
        
        req.on('error', (error) => {
          reject(error);
        });
        
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
        
        req.end();
      });
      
      console.log(`   Status: ${response.status}`);
      
      if (response.status === 200) {
        try {
          const jsonData = JSON.parse(response.data);
          if (endpoint.includes('campaigns')) {
            console.log(`   ✅ Campaigns: ${jsonData.campaigns?.length || 0} found`);
          } else if (endpoint.includes('calls')) {
            console.log(`   ✅ Calls: ${jsonData.calls?.length || 0} found`);
          } else if (endpoint.includes('analytics')) {
            console.log(`   ✅ Analytics: ${Object.keys(jsonData).join(', ')}`);
          }
        } catch (parseError) {
          console.log(`   ❌ JSON parse error: ${parseError.message}`);
          console.log(`   Raw data: ${response.data.substring(0, 200)}...`);
        }
      } else {
        console.log(`   ❌ Error: ${response.data}`);
      }
      
    } catch (error) {
      console.log(`   ❌ Request error: ${error.message}`);
    }
  }
  
  console.log('\n🔍 Common issues to check:');
  console.log('   1. Frontend using wrong API URL');
  console.log('   2. CORS issues');
  console.log('   3. Authentication token mismatch');
  console.log('   4. JavaScript errors in browser console');
  console.log('\n💡 Next steps:');
  console.log('   1. Check browser console for errors');
  console.log('   2. Verify VITE_API_URL in frontend .env');
  console.log('   3. Try refreshing the page');
}

testFrontendAPI().catch(console.error);