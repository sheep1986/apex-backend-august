require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getCampaigns() {
  console.log('🔍 Fetching available campaigns...');
  
  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('id, name, organization_id')
    .limit(5);

  if (error) {
    console.log('❌ Error:', error.message);
  } else if (campaigns && campaigns.length > 0) {
    console.log('✅ Available campaigns:');
    campaigns.forEach((campaign, index) => {
      console.log(`${index + 1}. ${campaign.name} (ID: ${campaign.id})`);
    });
    return campaigns[0]; // Return first campaign for testing
  } else {
    console.log('📭 No campaigns found');
  }
}

getCampaigns().then(campaign => {
  if (campaign) {
    console.log(`\n🎯 Using campaign: ${campaign.name} (${campaign.id})`);
  }
});