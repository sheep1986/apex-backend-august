import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkUnassignedLeads() {
  console.log('🔍 Checking unassigned leads...\n');
  
  try {
    // Get all leads without an owner
    const { data: unassignedLeads, error } = await supabase
      .from('leads')
      .select(`
        id,
        first_name,
        last_name,
        phone,
        email,
        company,
        campaign_id,
        created_at,
        lead_source,
        organization_id,
        campaigns(name)
      `)
      .is('uploaded_by', null)
      .order('created_at', { ascending: false });
      
    if (error) {
      console.error('Error fetching leads:', error);
      return;
    }
    
    console.log(`Found ${unassignedLeads.length} unassigned leads:\n`);
    
    unassignedLeads.forEach((lead, index) => {
      console.log(`${index + 1}. ${lead.first_name || 'Unknown'} ${lead.last_name || ''}`);
      console.log(`   Phone: ${lead.phone}`);
      console.log(`   Email: ${lead.email || 'None'}`);
      console.log(`   Company: ${lead.company || 'None'}`);
      console.log(`   Campaign: ${lead.campaigns?.name || 'NO CAMPAIGN (orphan lead)'}`);
      console.log(`   Campaign ID: ${lead.campaign_id || 'null'}`);
      console.log(`   Lead Source: ${lead.lead_source || 'Unknown'}`);
      console.log(`   Created: ${new Date(lead.created_at).toLocaleDateString()}`);
      console.log(`   Organization: ${lead.organization_id?.substring(0, 8) || 'None'}...`);
      console.log('');
    });
    
    // Check if these are all in the same org
    const orgs = [...new Set(unassignedLeads.map(l => l.organization_id))];
    console.log(`\nThese leads belong to ${orgs.length} organization(s)`);
    
    // Count by campaign status
    const withCampaign = unassignedLeads.filter(l => l.campaign_id).length;
    const withoutCampaign = unassignedLeads.filter(l => !l.campaign_id).length;
    
    console.log(`\nSummary:`);
    console.log(`- ${withCampaign} have campaigns but no owner (should be fixed)`);
    console.log(`- ${withoutCampaign} are orphan leads (no campaign)`);
    
  } catch (err) {
    console.error('Error:', err);
  }
}

checkUnassignedLeads();