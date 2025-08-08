const axios = require('axios');

async function testAPI() {
  try {
    console.log('Testing backend API health...');
    const response = await axios.get('http://localhost:3001/api/health');
    console.log('✅ Health check response:', response.data);
  } catch (error) {
    console.error('❌ API Error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('\n⚠️ Backend server is not running on port 3001');
      console.log('Please make sure the backend is running with: pnpm dev');
    }
  }
}

testAPI();