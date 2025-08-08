const axios = require('axios');
require('dotenv').config();

async function configureVapiWebhook() {
  console.log('🔧 Configuring VAPI webhook...\n');

  const VAPI_API_KEY = process.env.VAPI_API_KEY;
  if (!VAPI_API_KEY) {
    console.log('❌ VAPI_API_KEY not found in environment variables');
    return;
  }

  try {
    // 1. Get phone numbers
    console.log('1. Getting VAPI phone numbers...');
    const numbersResponse = await axios.get('https://api.vapi.ai/phone-number', {
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`📞 Found ${numbersResponse.data.length} phone numbers`);

    if (numbersResponse.data.length === 0) {
      console.log('⚠️ No phone numbers found. Please add a phone number in VAPI dashboard first.');
      return;
    }

    // 2. For each phone number, update webhook settings
    for (const phoneNumber of numbersResponse.data) {
      console.log(`\\n2. Updating webhook for ${phoneNumber.number}...`);
      
      // For local development, we'll use localhost
      // In production, this should be your actual domain
      const webhookUrl = 'http://localhost:3001/api/vapi-automation-webhook';
      const webhookSecret = process.env.VAPI_WEBHOOK_SECRET || 'vapi_webhook_secret_key';

      try {
        const updateResponse = await axios.patch(
          `https://api.vapi.ai/phone-number/${phoneNumber.id}`,
          {
            serverUrl: webhookUrl,
            serverUrlSecret: webhookSecret
          },
          {
            headers: {
              'Authorization': `Bearer ${VAPI_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        console.log(`✅ Updated webhook for ${phoneNumber.number}`);
        console.log(`   - Webhook URL: ${webhookUrl}`);
        console.log(`   - Secret: ${webhookSecret ? 'Set' : 'Not set'}`);

      } catch (updateError) {
        console.log(`❌ Failed to update ${phoneNumber.number}:`, updateError.response?.data || updateError.message);
      }
    }

    console.log('\\n🚨 IMPORTANT: Localhost webhooks will not work with VAPI');
    console.log('\\n📋 For webhooks to work with VAPI, you need:');
    console.log('1. A public URL that VAPI can reach');
    console.log('2. Use ngrok: ngrok http 3001');
    console.log('3. Then update webhook URL to: https://your-ngrok-id.ngrok-free.app/api/vapi-automation-webhook');
    console.log('\\n💡 Or use a service like:');
    console.log('   - ngrok (recommended)');
    console.log('   - localtunnel');
    console.log('   - cloudflare tunnel');

  } catch (error) {
    console.log('❌ Error configuring webhook:', error.response?.data || error.message);
  }
}

configureVapiWebhook().then(() => process.exit(0));