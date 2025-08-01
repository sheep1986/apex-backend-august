require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAndFixVAPISettings() {
  console.log('🔍 Checking and fixing VAPI settings in database...\n');

  try {
    // Get all organizations
    const { data: organizations, error: orgsError } = await supabase
      .from('organizations')
      .select('*');

    if (orgsError) {
      console.error('❌ Error fetching organizations:', orgsError);
      return;
    }

    console.log(`📊 Found ${organizations.length} organizations\n`);

    for (const org of organizations) {
      console.log(`\n🏢 Organization: ${org.name} (${org.id})`);
      console.log('━'.repeat(50));

      // Check current VAPI settings
      const hasVapiApiKey = !!org.vapi_api_key;
      const hasVapiSettings = !!org.vapi_settings;
      const hasSettingsVapi = !!(org.settings?.vapi);

      console.log(`✓ vapi_api_key column: ${hasVapiApiKey ? '✅ Present' : '❌ Missing'}`);
      console.log(`✓ vapi_settings column: ${hasVapiSettings ? '✅ Present' : '❌ Missing'}`);
      console.log(`✓ settings.vapi: ${hasSettingsVapi ? '✅ Present' : '❌ Missing'}`);

      // Check if we need to migrate settings
      if (!hasVapiApiKey && !hasVapiSettings && !hasSettingsVapi) {
        console.log('\n⚠️  No VAPI settings found in any location');
        
        // Check organization_settings table
        const { data: orgSettings } = await supabase
          .from('organization_settings')
          .select('*')
          .eq('organization_id', org.id)
          .eq('setting_key', 'vapi_credentials')
          .single();

        if (orgSettings) {
          console.log('📦 Found settings in organization_settings table');
          try {
            const credentials = JSON.parse(orgSettings.setting_value);
            console.log('🔄 Migrating to organizations table...');

            // Update organizations table with VAPI settings
            const { error: updateError } = await supabase
              .from('organizations')
              .update({
                vapi_api_key: credentials.apiKey,
                vapi_settings: JSON.stringify({
                  apiKey: credentials.apiKey,
                  privateKey: credentials.privateKey || credentials.apiKey,
                  webhookUrl: credentials.webhookUrl || 'https://api.apexai.com/webhooks/vapi',
                  enabled: credentials.enabled !== undefined ? credentials.enabled : true,
                  configured_at: new Date().toISOString()
                })
              })
              .eq('id', org.id);

            if (updateError) {
              console.error('❌ Error updating organization:', updateError);
            } else {
              console.log('✅ Successfully migrated VAPI settings!');
            }
          } catch (parseError) {
            console.error('❌ Error parsing organization_settings:', parseError);
          }
        } else {
          console.log('📝 No VAPI credentials found anywhere for this organization');
          console.log('   → User needs to configure VAPI settings in the Settings page');
        }
      } else {
        console.log('\n✅ VAPI settings already configured');
        
        // Show current configuration
        if (hasVapiApiKey) {
          console.log(`   API Key: ***${org.vapi_api_key.slice(-4)}`);
        }
        if (org.vapi_assistant_id) {
          console.log(`   Assistant ID: ${org.vapi_assistant_id}`);
        }
        if (org.vapi_phone_number_id) {
          console.log(`   Phone Number ID: ${org.vapi_phone_number_id}`);
        }
      }
    }

    console.log('\n\n✅ Check and fix completed!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the check
checkAndFixVAPISettings();