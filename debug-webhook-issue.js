const axios = require('axios');
require('dotenv').config();

async function debugWebhookIssue() {
  console.log('🔍 Debugging webhook issue...\n');

  // 1. Check if webhook endpoint is working
  try {
    console.log('1. Testing webhook endpoint health...');
    const healthResponse = await axios.get('http://localhost:3001/api/vapi-automation-webhook/health');
    console.log('✅ Webhook endpoint is healthy:', healthResponse.data);
  } catch (error) {
    console.log('❌ Webhook endpoint not accessible:', error.message);
    return;
  }

  // 2. Check webhook configuration
  try {
    console.log('\n2. Checking webhook configuration...');
    const configResponse = await axios.get('http://localhost:3001/api/vapi-automation-webhook/config');
    console.log('📋 Webhook config:', configResponse.data);
  } catch (error) {
    console.log('❌ Could not get webhook config:', error.message);
  }

  // 3. Test with VAPI API to see if webhook is configured
  try {
    console.log('\n3. Checking VAPI configuration...');
    const vapiResponse = await axios.get('https://api.vapi.ai/phone-number', {
      headers: {
        'Authorization': `Bearer ${process.env.VAPI_API_KEY}`
      }
    });
    
    console.log('📞 VAPI Phone Numbers:', vapiResponse.data.length);
    if (vapiResponse.data.length > 0) {
      const phoneNumber = vapiResponse.data[0];
      console.log('   - Number:', phoneNumber.number);
      console.log('   - Provider:', phoneNumber.provider);
      console.log('   - Server URL Webhook:', phoneNumber.serverUrl);
      console.log('   - Server URL Secret:', phoneNumber.serverUrlSecret ? 'Set' : 'Not set');
    }
  } catch (error) {
    console.log('❌ Could not check VAPI configuration:', error.response?.data || error.message);
  }

  // 4. Simulate a webhook call to test our handler
  console.log('\n4. Testing webhook handler with simulated call...');
  
  const simulatedWebhook = {
    message: {
      type: 'call-ended',
      call: {
        id: '43d8e5a4-45d9-4f4d-8741-62d4defbe539', // One of the stuck calls
        orgId: '1234567890',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        type: 'outboundPhoneCall',
        customer: {
          number: '+35699477503',
          name: 'Sanya'
        },
        status: 'ended',
        endedReason: 'customer-ended-call',
        startedAt: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
        endedAt: new Date().toISOString(),
        cost: 0.05,
        transcript: 'Hello, this is a test call. How are you today? I am fine, thank you.',
        summary: 'Customer answered the call and had a brief conversation.',
        recordingUrl: 'https://example.com/recording.mp3'
      },
      timestamp: new Date().toISOString()
    }
  };

  try {
    const webhookResponse = await axios.post('http://localhost:3001/api/vapi-automation-webhook', simulatedWebhook, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ Webhook handler responded:', webhookResponse.data);
  } catch (error) {
    console.log('❌ Webhook handler failed:', error.response?.data || error.message);
  }

  console.log('\n📋 Next Steps:');
  console.log('1. Configure VAPI webhook URL to point to your backend');
  console.log('2. If using localhost, set up ngrok or similar tunnel');
  console.log('3. Update VAPI phone number settings with webhook URL');
  console.log('\n💡 Webhook URL should be:');
  console.log('   - Local: http://localhost:3001/api/vapi-automation-webhook');
  console.log('   - With ngrok: https://your-ngrok-url.ngrok-free.app/api/vapi-automation-webhook'); 
  console.log('   - Production: https://your-domain.com/api/vapi-automation-webhook');
}

debugWebhookIssue().then(() => process.exit(0));