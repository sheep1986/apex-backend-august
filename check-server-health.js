const axios = require('axios');

async function checkServerHealth() {
  console.log('🔍 Checking server health...');
  
  try {
    // Check if server is running
    const response = await axios.get('http://localhost:3001/api/health');
    console.log('✅ Server is healthy:', response.data);
    
    // Check if it's the correct server (TypeScript version has version field)
    if (response.data.version) {
      console.log('✅ Correct TypeScript server is running');
    } else {
      console.error('❌ Wrong server running - simple-server.js detected');
      console.log('Run: pnpm dev:safe to fix this');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Server is not responding');
    console.log('Run: pnpm dev to start the server');
    process.exit(1);
  }
}

checkServerHealth();