const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCallAndOrg() {
  try {
    const callId = 'e21ca2b5-9f7d-43ac-baa2-2657811ebfcf';
    
    // Get the call with organization info
    const { data: call, error } = await supabase
      .from('calls')
      .select(`
        *,
        organization:organizations(
          id,
          name,
          vapi_api_key,
          vapi_private_key,
          settings
        )
      `)
      .eq('id', callId)
      .single();

    if (error) {
      console.error('Error fetching call:', error);
      return;
    }

    console.log('\n📞 Call Information:');
    console.log('Call ID:', call.id);
    console.log('VAPI Call ID:', call.vapi_call_id);
    console.log('Status:', call.status);
    console.log('Duration:', call.duration);
    console.log('Organization ID:', call.organization_id);
    console.log('Created:', call.created_at);
    
    if (call.organization) {
      console.log('\n🏢 Organization:');
      console.log('ID:', call.organization.id);
      console.log('Name:', call.organization.name);
      console.log('VAPI API Key:', call.organization.vapi_api_key ? call.organization.vapi_api_key.substring(0, 20) + '...' : 'Not set');
      console.log('VAPI Private Key:', call.organization.vapi_private_key ? call.organization.vapi_private_key.substring(0, 20) + '...' : 'Not set');
      
      if (call.organization.settings?.vapi) {
        console.log('\nVAPI Settings from JSON:');
        console.log('API Key:', call.organization.settings.vapi.apiKey ? call.organization.settings.vapi.apiKey.substring(0, 20) + '...' : 'Not set');
        console.log('Private Key:', call.organization.settings.vapi.privateKey ? call.organization.settings.vapi.privateKey.substring(0, 20) + '...' : 'Not set');
      }
      
      // Show the actual VAPI key that would be used
      const vapiKey = call.organization.vapi_private_key || 
                      call.organization.vapi_api_key || 
                      call.organization.settings?.vapi?.privateKey ||
                      call.organization.settings?.vapi?.apiKey;
      
      console.log('\n🔑 Actual VAPI Key to Use:', vapiKey ? vapiKey.substring(0, 20) + '...' : 'NONE FOUND');
      
      if (vapiKey && vapiKey !== 'da8956d4-0508-474e-bd96-7eda82d2d943') {
        console.log('\n⚠️ WARNING: The organization\'s VAPI key is different from the one in .env!');
        console.log('Organization key starts with:', vapiKey.substring(0, 20));
        console.log('.env key starts with:', 'da8956d4-0508-474e-bd96');
      }
    }
    
    // Also check the campaign that made this call
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', call.campaign_id)
      .single();
      
    if (campaign) {
      console.log('\n📢 Campaign:');
      console.log('ID:', campaign.id);
      console.log('Name:', campaign.name);
      console.log('Assistant ID:', campaign.assistant_id);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

checkCallAndOrg();