require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugVAPIApiDirectly() {
  try {
    console.log('🔍 Debug: VAPI API Direct Test for Emerald Green Energy');
    console.log('====================================================\n');

    const emeraldGreenOrgId = '2566d8c5-2245-4a3c-b539-4cea21a07d9b';

    // Get the organization's VAPI credentials
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('name, vapi_api_key, vapi_private_key, settings')
      .eq('id', emeraldGreenOrgId)
      .single();

    if (orgError || !org) {
      console.error('❌ Error fetching organization:', orgError);
      return;
    }

    console.log('🏢 Organization:', org.name);
    console.log('   - Has vapi_api_key:', !!org.vapi_api_key);
    console.log('   - Has vapi_private_key:', !!org.vapi_private_key);
    console.log('   - Has settings.vapi:', !!org.settings?.vapi);

    // Test each API key we have
    const apiKeysToTest = [];
    
    if (org.vapi_private_key) {
      apiKeysToTest.push({
        key: org.vapi_private_key,
        source: 'vapi_private_key',
        preview: org.vapi_private_key.substring(0, 10) + '...'
      });
    }
    
    if (org.vapi_api_key) {
      apiKeysToTest.push({
        key: org.vapi_api_key,
        source: 'vapi_api_key',
        preview: org.vapi_api_key.substring(0, 10) + '...'
      });
    }
    
    if (org.settings?.vapi?.apiKey) {
      apiKeysToTest.push({
        key: org.settings.vapi.apiKey,
        source: 'settings.vapi.apiKey',
        preview: org.settings.vapi.apiKey.substring(0, 10) + '...'
      });
    }

    console.log(`\n🔑 Found ${apiKeysToTest.length} API keys to test\n`);

    // Test each API key
    for (const apiKeyInfo of apiKeysToTest) {
      console.log(`🧪 Testing ${apiKeyInfo.source}: ${apiKeyInfo.preview}`);
      
      const https = require('https');
      
      // Test assistants endpoint
      await testEndpoint(apiKeyInfo.key, '/assistant', 'Assistants');
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Test phone numbers endpoint
      await testEndpoint(apiKeyInfo.key, '/phone-number', 'Phone Numbers');
      
      console.log('');
    }

  } catch (error) {
    console.error('❌ Debug error:', error);
  }
}

async function testEndpoint(apiKey, endpoint, name) {
  return new Promise((resolve) => {
    const https = require('https');
    
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
            if (Array.isArray(result)) {
              console.log(`   ✅ ${name}: ${result.length} items found`);
              if (result.length > 0) {
                console.log(`      First item: ${result[0].name || result[0].number || result[0].id || 'Unknown'}`);
              }
            } else {
              console.log(`   ⚠️ ${name}: Non-array response`);
              console.log(`      Response:`, JSON.stringify(result).substring(0, 100) + '...');
            }
          } catch (e) {
            console.log(`   ❌ ${name}: Failed to parse JSON response`);
          }
        } else {
          console.log(`   ❌ ${name}: HTTP ${res.statusCode}`);
          if (res.statusCode === 401) {
            console.log(`      → Invalid or expired API key`);
          } else if (res.statusCode === 404) {
            console.log(`      → Endpoint not found (check URL)`);
          } else {
            console.log(`      → Response: ${data.substring(0, 200)}`);
          }
        }
        resolve();
      });
    });
    
    req.on('error', (error) => {
      console.log(`   ❌ ${name}: Network error - ${error.message}`);
      resolve();
    });
    
    req.on('timeout', () => {
      console.log(`   ❌ ${name}: Request timeout`);
      req.destroy();
      resolve();
    });
    
    req.end();
  });
}

// Run the debug
debugVAPIApiDirectly();