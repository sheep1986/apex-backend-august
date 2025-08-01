const fetch = require('node-fetch');

async function testApiAuth() {
  const tokens = [
    'test-token',
    'test-token-platform_owner',
    'owner-token'
  ];

  for (const token of tokens) {
    console.log(`\n🔑 Testing with token: ${token}`);
    
    try {
      const response = await fetch('http://localhost:3001/api/api-configurations', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`📡 Response status: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Success:', data);
      } else {
        const error = await response.text();
        console.log('❌ Error:', error);
      }
    } catch (err) {
      console.log('💥 Network error:', err.message);
    }
  }
}

testApiAuth();