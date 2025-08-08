import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkLeadOwnership() {
  console.log('🔍 Checking lead ownership...\n');
  
  try {
    // 1. Check leads with their uploaded_by status
    const { data: leads, error } = await supabase
      .from('leads')
      .select(`
        id,
        first_name,
        last_name,
        campaign_id,
        uploaded_by,
        campaigns(
          id,
          name,
          created_by
        )
      `)
      .limit(20);
      
    if (error) {
      console.error('Error fetching leads:', error);
      return;
    }
    
    console.log(`Found ${leads.length} leads\n`);
    
    // Group by campaign
    const campaigns = {};
    leads.forEach(lead => {
      const campaignId = lead.campaign_id;
      if (!campaigns[campaignId]) {
        campaigns[campaignId] = {
          name: lead.campaigns?.name || 'Unknown',
          created_by: lead.campaigns?.created_by,
          leads: []
        };
      }
      campaigns[campaignId].leads.push({
        name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown',
        uploaded_by: lead.uploaded_by
      });
    });
    
    // Display results
    Object.entries(campaigns).forEach(([campaignId, data]) => {
      console.log(`\n📋 Campaign: ${data.name} (${campaignId.substring(0, 8)}...)`);
      console.log(`   Created by: ${data.created_by || 'Unknown'}`);
      console.log(`   Leads:`);
      data.leads.forEach(lead => {
        console.log(`     - ${lead.name}: ${lead.uploaded_by ? '✅ Has owner' : '❌ No owner'}`);
      });
    });
    
    // 2. Check if there are campaigns without created_by
    const { data: campaignsWithoutCreator } = await supabase
      .from('campaigns')
      .select('id, name, created_by')
      .is('created_by', null);
      
    if (campaignsWithoutCreator?.length > 0) {
      console.log('\n⚠️  Campaigns without created_by:');
      campaignsWithoutCreator.forEach(c => {
        console.log(`   - ${c.name} (${c.id.substring(0, 8)}...)`);
      });
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

checkLeadOwnership();