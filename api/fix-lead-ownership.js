import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixLeadOwnership() {
  console.log('🔧 Fixing lead ownership...\n');
  
  try {
    // 1. Get all campaigns with their created_by
    const { data: campaigns, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, name, created_by')
      .not('created_by', 'is', null);
      
    if (campaignError) {
      console.error('Error fetching campaigns:', campaignError);
      return;
    }
    
    console.log(`Found ${campaigns.length} campaigns with creators\n`);
    
    // 2. For each campaign, update leads without owners
    for (const campaign of campaigns) {
      console.log(`\n📋 Processing campaign: ${campaign.name}`);
      console.log(`   Creator: ${campaign.created_by}`);
      
      // Update leads in this campaign that don't have an owner
      const { data, error } = await supabase
        .from('leads')
        .update({ uploaded_by: campaign.created_by })
        .eq('campaign_id', campaign.id)
        .is('uploaded_by', null);
        
      if (error) {
        console.error(`   ❌ Error updating leads:`, error);
      } else {
        // Count how many were updated
        const { count } = await supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)
          .eq('uploaded_by', campaign.created_by);
          
        console.log(`   ✅ Updated leads to have owner: ${count || 0} total leads now owned by creator`);
      }
    }
    
    // 3. Handle leads without campaigns (set to a default admin if needed)
    const { data: orphanLeads, count: orphanCount } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .is('campaign_id', null)
      .is('uploaded_by', null);
      
    if (orphanCount > 0) {
      console.log(`\n⚠️  Found ${orphanCount} leads without campaigns or owners`);
      console.log('   These will remain unassigned until added to a campaign');
    }
    
    console.log('\n✅ Lead ownership fix complete!');
    
  } catch (err) {
    console.error('Error:', err);
  }
}

// Add confirmation prompt
console.log('This will update all leads to be owned by their campaign creators.');
console.log('Press Ctrl+C to cancel, or wait 3 seconds to continue...\n');

setTimeout(() => {
  fixLeadOwnership();
}, 3000);