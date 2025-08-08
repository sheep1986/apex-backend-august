require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugAuthenticatedUser() {
  try {
    console.log('🔍 Debug: What the Backend Sees for Qasim');
    console.log('==========================================\n');

    const qasimClerkId = 'user_30YowJ7d9kTMTfyzUZFVkFv7tCZ';

    // Get user exactly as the backend authentication middleware would
    const { data: user, error: userError } = await supabase
      .from('users')
      .select(`
        id,
        clerk_id,
        email,
        first_name,
        last_name,
        role,
        organization_id,
        status,
        organizations (
          id,
          name,
          vapi_api_key,
          vapi_private_key,
          settings
        )
      `)
      .eq('clerk_id', qasimClerkId)
      .eq('status', 'active')
      .single();

    if (userError) {
      console.error('❌ Error fetching user (as backend would):', userError);
      console.log('\n💡 POSSIBLE ISSUES:');
      console.log('1. User status is not "active" (might be "invited")');
      console.log('2. Clerk ID mismatch');
      console.log('3. User record doesn\'t exist');
      return;
    }

    console.log('✅ User found successfully:');
    console.log('   - Name:', user.first_name, user.last_name);
    console.log('   - Email:', user.email);
    console.log('   - Clerk ID:', user.clerk_id);
    console.log('   - Role:', user.role);
    console.log('   - Status:', user.status);
    console.log('   - Organization ID:', user.organization_id);

    if (user.organizations) {
      console.log('   - Organization Name:', user.organizations.name);
      console.log('   - Has VAPI Private Key:', !!user.organizations.vapi_private_key);
      console.log('   - Has VAPI Public Key:', !!user.organizations.vapi_api_key);
      console.log('   - Has VAPI Settings:', !!user.organizations.settings?.vapi);
      
      if (user.organizations.vapi_private_key) {
        console.log('   - Private Key Preview:', user.organizations.vapi_private_key.substring(0, 8) + '...');
      }
    } else {
      console.log('   - ❌ NO ORGANIZATION FOUND');
    }

    // Now test VAPI API directly with this user's credentials
    if (user.organizations?.vapi_private_key) {
      console.log('\n🧪 Testing VAPI API with user\'s organization credentials...');
      
      const https = require('https');
      const apiKey = user.organizations.vapi_private_key;
      
      // Test assistants endpoint
      const testVAPI = (endpoint) => {
        return new Promise((resolve, reject) => {
          const options = {
            hostname: 'api.vapi.ai',
            port: 443,
            path: endpoint,
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
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
          
          req.on('error', reject);
          req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
          });
          
          req.end();
        });
      };

      try {
        const assistants = await testVAPI('/assistant');
        console.log(`   ✅ Assistants: ${Array.isArray(assistants) ? assistants.length : 'Invalid response'}`);
        
        const phoneNumbers = await testVAPI('/phone-number');
        console.log(`   ✅ Phone Numbers: ${Array.isArray(phoneNumbers) ? phoneNumbers.length : 'Invalid response'}`);
        
        if (Array.isArray(assistants) && assistants.length === 0) {
          console.log('\n⚠️ VAPI API returned empty arrays');
          console.log('   This could mean:');
          console.log('   1. No assistants/phone numbers in this VAPI account');
          console.log('   2. Different VAPI account than expected');
          console.log('   3. API key is for wrong environment');
        }
        
      } catch (error) {
        console.error('   ❌ VAPI API Error:', error.message);
      }
    }

    // Check what the VAPIIntegrationService.forOrganization would return
    console.log('\n🔍 Simulating VAPIIntegrationService.forOrganization...');
    
    if (user.organization_id) {
      // This is exactly what the service does
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('settings, vapi_api_key, vapi_private_key, vapi_settings')
        .eq('id', user.organization_id)
        .single();

      if (orgError || !org) {
        console.log('   ❌ Organization not found:', orgError);
      } else {
        console.log('   ✅ Organization found');
        console.log('   - Has settings.vapi:', !!org.settings?.vapi);
        console.log('   - Has vapi_settings:', !!org.vapi_settings);
        console.log('   - Has vapi_private_key:', !!org.vapi_private_key);
        console.log('   - Has vapi_api_key:', !!org.vapi_api_key);
        
        // Show what API key would be used
        let apiKey = null;
        if (org.settings?.vapi?.apiKey) {
          apiKey = org.settings.vapi.apiKey;
          console.log('   - Would use settings.vapi.apiKey:', apiKey.substring(0, 8) + '...');
        } else if (org.vapi_private_key) {
          apiKey = org.vapi_private_key;
          console.log('   - Would use vapi_private_key:', apiKey.substring(0, 8) + '...');
        }
      }
    }

  } catch (error) {
    console.error('❌ Debug error:', error);
  }
}

// Run the debug
debugAuthenticatedUser();