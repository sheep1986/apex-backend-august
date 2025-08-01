require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  console.error('Please ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function diagnoseVAPICredentials() {
  try {
    console.log('🔍 VAPI Credentials Diagnostic Tool');
    console.log('=====================================\n');

    // Get all organizations
    const { data: organizations, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, settings, vapi_api_key, vapi_private_key, vapi_settings');

    if (orgError) {
      console.error('❌ Error fetching organizations:', orgError);
      return;
    }

    console.log(`📋 Found ${organizations?.length || 0} organizations\n`);

    for (const org of organizations || []) {
      console.log(`🏢 Organization: ${org.name} (ID: ${org.id})`);
      console.log('─'.repeat(50));

      let hasCredentials = false;
      let credentialSource = null;
      let apiKey = null;
      let privateKey = null;

      // Check settings.vapi path
      if (org.settings?.vapi) {
        console.log('✅ Found VAPI config in settings.vapi');
        hasCredentials = true;
        credentialSource = 'settings.vapi';
        apiKey = org.settings.vapi.apiKey;
        privateKey = org.settings.vapi.privateKey;
        console.log('   - API Key:', apiKey ? `${apiKey.substring(0, 8)}...` : 'MISSING');
        console.log('   - Private Key:', privateKey ? `${privateKey.substring(0, 8)}...` : 'MISSING');
        console.log('   - Enabled:', org.settings.vapi.enabled !== false ? 'YES' : 'NO');
      }

      // Check vapi_settings column
      if (org.vapi_settings) {
        try {
          const vapiSettings = JSON.parse(org.vapi_settings);
          console.log('✅ Found VAPI config in vapi_settings column');
          if (!hasCredentials) {
            hasCredentials = true;
            credentialSource = 'vapi_settings';
            apiKey = vapiSettings.apiKey;
            privateKey = vapiSettings.privateKey;
          }
          console.log('   - API Key:', vapiSettings.apiKey ? `${vapiSettings.apiKey.substring(0, 8)}...` : 'MISSING');
          console.log('   - Private Key:', vapiSettings.privateKey ? `${vapiSettings.privateKey.substring(0, 8)}...` : 'MISSING');
          console.log('   - Enabled:', vapiSettings.enabled !== false ? 'YES' : 'NO');
        } catch (parseError) {
          console.log('⚠️ Found vapi_settings column but failed to parse JSON');
        }
      }

      // Check individual columns
      if (org.vapi_private_key || org.vapi_api_key) {
        console.log('✅ Found VAPI keys in individual columns');
        if (!hasCredentials) {
          hasCredentials = true;
          credentialSource = 'individual_columns';
          apiKey = org.vapi_private_key || org.vapi_api_key;
          privateKey = org.vapi_private_key;
        }
        console.log('   - vapi_api_key (PUBLIC):', org.vapi_api_key ? `${org.vapi_api_key.substring(0, 8)}...` : 'MISSING');
        console.log('   - vapi_private_key (PRIVATE):', org.vapi_private_key ? `${org.vapi_private_key.substring(0, 8)}...` : 'MISSING');
      }

      // Check organization_settings table (legacy)
      const { data: legacySettings, error: legacyError } = await supabase
        .from('organization_settings')
        .select('setting_value')
        .eq('organization_id', org.id)
        .eq('setting_key', 'vapi_credentials')
        .single();

      if (legacySettings && !legacyError) {
        try {
          const credentials = JSON.parse(legacySettings.setting_value);
          console.log('✅ Found VAPI config in organization_settings (legacy)');
          if (!hasCredentials) {
            hasCredentials = true;
            credentialSource = 'organization_settings';
            apiKey = credentials.apiKey;
            privateKey = credentials.privateKey;
          }
          console.log('   - API Key:', credentials.apiKey ? `${credentials.apiKey.substring(0, 8)}...` : 'MISSING');
          console.log('   - Private Key:', credentials.privateKey ? `${credentials.privateKey.substring(0, 8)}...` : 'MISSING');
          console.log('   - Enabled:', credentials.enabled !== false ? 'YES' : 'NO');
        } catch (parseError) {
          console.log('⚠️ Found organization_settings but failed to parse JSON');
        }
      }

      // Test the API key if we found one
      if (hasCredentials && apiKey) {
        console.log(`\n🧪 Testing VAPI API connection (using ${credentialSource})...`);
        await testVAPIConnection(apiKey);
      }

      if (!hasCredentials) {
        console.log('❌ NO VAPI CREDENTIALS FOUND');
        console.log('💡 To fix this, add VAPI credentials in Organization Settings');
      }

      console.log('\n');
    }

    // Summary and recommendations
    console.log('📋 SUMMARY & RECOMMENDATIONS');
    console.log('============================');
    console.log('1. The VAPI integration looks for credentials in this order:');
    console.log('   - organizations.settings.vapi (JSON object)');
    console.log('   - organizations.vapi_settings (JSON string)');
    console.log('   - organizations.vapi_private_key + vapi_api_key (individual columns)');
    console.log('   - organization_settings table with key "vapi_credentials" (legacy)');
    console.log('');
    console.log('2. For API calls, it uses the PRIVATE key (not the public key)');
    console.log('3. The vapi_api_key column should contain the PUBLIC key');
    console.log('4. The vapi_private_key column should contain the PRIVATE key');
    console.log('');
    console.log('🔧 To fix VAPI integration:');
    console.log('1. Go to Organization Settings in the UI');
    console.log('2. Add your VAPI Private Key (starts with sk_...)');
    console.log('3. Add your VAPI Public Key (starts with pk_...)');
    console.log('4. Test the connection');

  } catch (error) {
    console.error('❌ Error running diagnostic:', error);
  }
}

async function testVAPIConnection(apiKey) {
  try {
    const https = require('https');
    
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.vapi.ai',
        port: 443,
        path: '/assistant',
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
              const assistants = JSON.parse(data);
              console.log(`✅ API Test SUCCESS - Found ${assistants.length} assistants`);
              if (assistants.length > 0) {
                console.log(`   First assistant: ${assistants[0].name || 'Unnamed'}`);
              }
            } catch (e) {
              console.log('✅ API Test SUCCESS - Valid response but failed to parse');
            }
          } else if (res.statusCode === 401) {
            console.log('❌ API Test FAILED - 401 Unauthorized');
            console.log('   This usually means:');
            console.log('   - Wrong API key');
            console.log('   - Using public key instead of private key');
            console.log('   - API key has been revoked');
          } else {
            console.log(`❌ API Test FAILED - HTTP ${res.statusCode}`);
            console.log(`   Response: ${data.substring(0, 200)}`);
          }
          resolve();
        });
      });
      
      req.on('error', (error) => {
        console.log(`❌ API Test FAILED - Network error: ${error.message}`);
        resolve();
      });
      
      req.on('timeout', () => {
        console.log('❌ API Test FAILED - Request timeout');
        req.destroy();
        resolve();
      });
      
      req.end();
    });
  } catch (error) {
    console.log(`❌ API Test FAILED - ${error.message}`);
  }
}

// Run the diagnostic
diagnoseVAPICredentials();