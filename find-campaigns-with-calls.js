const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function findCampaignsWithCalls() {
  console.log('🔍 Finding campaigns with calls...\n');

  // Get all campaigns
  const { data: campaigns, error: campaignError } = await client
    .from('campaigns')
    .select('id, name, created_at')
    .order('created_at', { ascending: false });

  if (campaignError) {
    console.error('❌ Error fetching campaigns:', campaignError);
    return;
  }

  console.log(`📊 Found ${campaigns.length} campaigns\n`);

  // Check each campaign for calls
  for (const campaign of campaigns) {
    const { data: calls, count } = await client
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaign.id);

    if (count > 0) {
      console.log(`✅ Campaign: ${campaign.name}`);
      console.log(`   ID: ${campaign.id}`);
      console.log(`   Calls: ${count}`);
      console.log(`   Created: ${campaign.created_at}\n`);
    }
  }

  // Also check for calls without campaign_id
  const { data: orphanCalls, count: orphanCount } = await client
    .from('calls')
    .select('*', { count: 'exact', head: true })
    .is('campaign_id', null);

  if (orphanCount > 0) {
    console.log(`⚠️ Found ${orphanCount} calls without campaign_id`);
  }
}

findCampaignsWithCalls().then(() => process.exit(0));