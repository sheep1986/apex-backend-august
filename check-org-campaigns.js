const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkOrganizationCampaigns() {
  try {
    // First, let's find Sean's user and organization
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('*')
      .ilike('email', '%sean%');

    if (userError) {
      console.error('Error fetching user:', userError);
      return;
    }

    if (!users || users.length === 0) {
      console.log('No user found with email sean@hiretom.com');
      return;
    }

    const user = users[0];
    console.log('\n👤 User found:');
    console.log('ID:', user.id);
    console.log('Email:', user.email);
    console.log('Organization ID:', user.organization_id);
    console.log('Status:', user.status);

    // Now check campaigns for this organization
    const { data: campaigns, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('organization_id', user.organization_id);

    if (campaignError) {
      console.error('Error fetching campaigns:', campaignError);
      return;
    }

    console.log(`\n📢 Found ${campaigns.length} campaigns for organization ${user.organization_id}:`);
    
    campaigns.forEach(campaign => {
      console.log(`\n- ${campaign.name} (${campaign.id})`);
      console.log('  Status:', campaign.status);
      console.log('  Type:', campaign.type);
      console.log('  Created:', campaign.created_at);
      console.log('  Assistant ID:', campaign.assistant_id);
      console.log('  Phone Numbers:', campaign.phone_numbers);
    });

    // Also check if there are ANY campaigns in the database
    const { data: allCampaigns, count } = await supabase
      .from('campaigns')
      .select('organization_id', { count: 'exact' });

    console.log(`\n📊 Total campaigns in database: ${count}`);
    
    // Group by organization
    const orgCounts = {};
    allCampaigns.forEach(c => {
      orgCounts[c.organization_id] = (orgCounts[c.organization_id] || 0) + 1;
    });
    
    console.log('\nCampaigns per organization:');
    Object.entries(orgCounts).forEach(([orgId, count]) => {
      console.log(`  ${orgId}: ${count} campaigns`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

checkOrganizationCampaigns();