require('dotenv').config();

// Import the service directly from TypeScript  
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Simple function to test VAPI API directly
async function testVapiAPI(apiKey, endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.vapi.ai',
      port: 443,
      path: endpoint,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 10000
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (e) {
            reject(new Error('Failed to parse response'));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.end();
  });
}

async function testVapiIntegration() {
  try {
    console.log('🔍 Testing VAPI API Direct Access');
    console.log('==================================\n');

    // Get Test Corp credentials
    const testCorpOrgId = '0f88ab8a-b760-4c2a-b289-79b54d7201cf';
    
    const { data: org, error } = await supabase
      .from('organizations')
      .select('name, vapi_private_key, settings')
      .eq('id', testCorpOrgId)
      .single();

    if (error || !org) {
      console.error('❌ Could not fetch organization:', error);
      return;
    }

    console.log(`📞 Testing organization: ${org.name}`);

    // Get the API key (prefer private key for API calls)
    let apiKey = org.vapi_private_key;
    if (!apiKey && org.settings?.vapi?.apiKey) {
      apiKey = org.settings.vapi.apiKey;
    }

    if (!apiKey) {
      console.log('❌ No API key found');
      return;
    }

    console.log(`🔑 Using API key: ${apiKey.substring(0, 8)}...`);

    // Test assistants
    console.log('\n🤖 Testing assistants endpoint...');
    try {
      const assistants = await testVapiAPI(apiKey, '/assistant');
      console.log(`✅ Found ${Array.isArray(assistants) ? assistants.length : 'unknown count'} assistants`);
      if (Array.isArray(assistants) && assistants.length > 0) {
        console.log('📋 Sample assistants:');
        assistants.slice(0, 3).forEach((assistant, index) => {
          console.log(`   ${index + 1}. ${assistant.name || 'Unnamed'} (ID: ${assistant.id})`);
        });
      } else {
        console.log('⚠️ No assistants found or unexpected response format');
        console.log('Raw response:', assistants);
      }
    } catch (error) {
      console.error('❌ Assistants error:', error.message);
    }
    
    // Test phone numbers
    console.log('\n📱 Testing phone numbers endpoint...');
    try {
      const phoneNumbers = await testVapiAPI(apiKey, '/phone-number');
      console.log(`✅ Found ${Array.isArray(phoneNumbers) ? phoneNumbers.length : 'unknown count'} phone numbers`);
      if (Array.isArray(phoneNumbers) && phoneNumbers.length > 0) {
        console.log('📋 Sample phone numbers:');
        phoneNumbers.slice(0, 3).forEach((phone, index) => {
          console.log(`   ${index + 1}. ${phone.number || phone.phoneNumber || 'No number'} (ID: ${phone.id})`);
        });
      } else {
        console.log('⚠️ No phone numbers found or unexpected response format');
        console.log('Raw response:', phoneNumbers);
      }
    } catch (error) {
      console.error('❌ Phone numbers error:', error.message);
    }

    console.log('\n✅ Direct VAPI API test complete');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testVapiIntegration();