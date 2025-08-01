require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration. Please check your .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateVAPIKey(organizationId, newApiKey) {
  try {
    console.log(`🔑 Updating VAPI API key for organization: ${organizationId}`);
    
    // Prepare VAPI settings object
    const vapiSettings = {
      apiKey: newApiKey,
      privateKey: newApiKey,
      webhookUrl: 'https://apex-backend-pay4.onrender.com/api/vapi/webhook',
      enabled: true,
      configured_at: new Date().toISOString()
    };

    // Update organizations table with new VAPI settings
    const { error: updateError } = await supabase
      .from('organizations')
      .update({
        settings: {
          vapi: vapiSettings
        },
        vapi_api_key: newApiKey,
        vapi_settings: JSON.stringify(vapiSettings),
        updated_at: new Date().toISOString()
      })
      .eq('id', organizationId);

    if (updateError) {
      console.error('❌ Error updating VAPI API key:', updateError);
      return false;
    }

    console.log('✅ VAPI API key updated successfully');
    return true;

  } catch (error) {
    console.error('❌ Error:', error);
    return false;
  }
}

// Get command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node update-vapi-key.js <organization_id> <new_api_key>');
  console.log('');
  console.log('Example:');
  console.log('node update-vapi-key.js 71ff89f2-6af9-45cb-b3de-0873b90f1058 sk-your-new-vapi-key');
  console.log('');
  console.log('Available organizations:');
  
  // List available organizations
  supabase
    .from('organizations')
    .select('id, name')
    .then(({ data, error }) => {
      if (error) {
        console.error('❌ Error fetching organizations:', error);
        return;
      }
      
      data.forEach(org => {
        console.log(`  - ${org.name}: ${org.id}`);
      });
    });
  
  process.exit(1);
}

const [organizationId, newApiKey] = args;
updateVAPIKey(organizationId, newApiKey).then(success => {
  if (success) {
    console.log('🎉 Update complete! The VAPI endpoints should now work with real data.');
  } else {
    console.log('❌ Update failed. Please check the errors above.');
  }
  process.exit(success ? 0 : 1);
});