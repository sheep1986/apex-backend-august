require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function showEmeraldGreenKeys() {
  try {
    console.log('🔑 VAPI API Keys for Emerald Green Energy Ltd');
    console.log('===============================================\n');

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
    console.log('📍 Organization ID:', emeraldGreenOrgId);
    console.log('\n🔑 API Keys Currently Stored:');
    
    // Show vapi_api_key (PUBLIC key)
    if (org.vapi_api_key) {
      console.log('\n📝 vapi_api_key (PUBLIC):');
      console.log('   Full Key:', org.vapi_api_key);
      console.log('   Preview: ', org.vapi_api_key.substring(0, 15) + '...');
      console.log('   Length:  ', org.vapi_api_key.length, 'characters');
    } else {
      console.log('\n❌ vapi_api_key: NOT SET');
    }
    
    // Show vapi_private_key (PRIVATE key - used for API calls)
    if (org.vapi_private_key) {
      console.log('\n🔐 vapi_private_key (PRIVATE - used for API calls):');
      console.log('   Full Key:', org.vapi_private_key);
      console.log('   Preview: ', org.vapi_private_key.substring(0, 15) + '...');
      console.log('   Length:  ', org.vapi_private_key.length, 'characters');
    } else {
      console.log('\n❌ vapi_private_key: NOT SET');
    }
    
    // Show settings.vapi
    if (org.settings?.vapi) {
      console.log('\n⚙️ settings.vapi:');
      console.log('   API Key:', org.settings.vapi.apiKey || 'NOT SET');
      console.log('   Private Key:', org.settings.vapi.privateKey || 'NOT SET');
      console.log('   Enabled:', org.settings.vapi.enabled);
      console.log('   Full Settings:', JSON.stringify(org.settings.vapi, null, 2));
    } else {
      console.log('\n❌ settings.vapi: NOT SET');
    }

    // Show which key the VAPIIntegrationService would use
    console.log('\n🎯 VAPIIntegrationService Priority Order:');
    console.log('   1. settings.vapi.apiKey:', org.settings?.vapi?.apiKey ? '✅ FOUND' : '❌ NOT FOUND');
    console.log('   2. vapi_private_key:     ', org.vapi_private_key ? '✅ FOUND' : '❌ NOT FOUND');
    console.log('   3. vapi_api_key:         ', org.vapi_api_key ? '✅ FOUND' : '❌ NOT FOUND');

    // Determine which key would be used
    let usedKey = null;
    let usedSource = null;
    
    if (org.settings?.vapi?.apiKey) {
      usedKey = org.settings.vapi.apiKey;
      usedSource = 'settings.vapi.apiKey';
    } else if (org.vapi_private_key) {
      usedKey = org.vapi_private_key;
      usedSource = 'vapi_private_key';
    } else if (org.vapi_api_key) {
      usedKey = org.vapi_api_key;
      usedSource = 'vapi_api_key';
    }

    if (usedKey) {
      console.log('\n✅ SELECTED KEY FOR API CALLS:');
      console.log('   Source:', usedSource);
      console.log('   Key:   ', usedKey);
      console.log('   This is the key that will be sent to VAPI API');
    } else {
      console.log('\n❌ NO USABLE KEY FOUND');
    }

  } catch (error) {
    console.error('❌ Error showing keys:', error);
  }
}

// Run the script
showEmeraldGreenKeys();