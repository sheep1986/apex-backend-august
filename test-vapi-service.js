const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testVAPIService() {
  try {
    const organizationId = '2566d8c5-2245-4a3c-b539-4cea21a07d9b';
    
    // Check organization's VAPI settings
    const { data: organization, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', organizationId)
      .single();

    if (error) {
      console.error('Error fetching organization:', error);
      return;
    }

    console.log('\n🏢 Organization:', organization.name);
    console.log('VAPI API Key:', organization.vapi_api_key ? organization.vapi_api_key.substring(0, 20) + '...' : 'NOT SET');
    console.log('VAPI Private Key:', organization.vapi_private_key ? organization.vapi_private_key.substring(0, 20) + '...' : 'NOT SET');
    
    if (organization.settings) {
      console.log('\nSettings object exists:', !!organization.settings);
      console.log('Settings.vapi:', organization.settings.vapi);
    }

    // Now test the API endpoint directly
    console.log('\n📡 Testing API endpoint...');
    const axios = require('axios');
    
    try {
      const response = await axios.get('http://localhost:3001/api/vapi-outbound/campaigns', {
        headers: {
          'Authorization': 'Bearer test-token',
          'x-organization-id': organizationId
        }
      });
      
      console.log('Response:', response.data);
    } catch (apiError) {
      console.error('API Error:', apiError.response?.data || apiError.message);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

testVAPIService();