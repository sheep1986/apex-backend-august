const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.log('❌ No Supabase key found in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCampaigns() {
  console.log('🔍 Checking campaigns data...\n');
  
  // Get all campaigns
  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });
    
  if (error) {
    console.log('❌ Error fetching campaigns:', error.message);
    return;
  }
  
  console.log('📊 Found', campaigns.length, 'campaigns:\n');
  
  campaigns.forEach((campaign, index) => {
    console.log(`Campaign ${index + 1}:`);
    console.log('  ID:', campaign.id);
    console.log('  Name:', campaign.name);
    console.log('  Status:', campaign.status);
    console.log('  Type:', campaign.type);
    console.log('  Industry:', campaign.industry);
    console.log('  Organization ID:', campaign.organization_id);
    console.log('  Created:', new Date(campaign.created_at).toLocaleString());
    console.log('');
  });
}

checkCampaigns().then(() => process.exit(0));