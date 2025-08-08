#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://twigokrtbvigiqnaybfy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function addLeadsToCampaign() {
  console.log('📤 Adding test leads to latest campaign...\n');
  
  try {
    // Get the latest campaign
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (!campaigns || campaigns.length === 0) {
      console.log('No campaigns found');
      return;
    }
    
    const campaign = campaigns[0];
    console.log(`Campaign: ${campaign.name} (${campaign.id})`);
    console.log(`Status: ${campaign.status}\n`);
    
    // Add test leads - using only your number
    const testLeads = [
      {
        campaign_id: campaign.id,
        organization_id: campaign.organization_id,
        first_name: 'Sean',
        last_name: 'Test One',
        phone: '447526126716',
        email: 'sean1@test.com',
        company: 'Test Company'
      },
      {
        campaign_id: campaign.id,
        organization_id: campaign.organization_id,
        first_name: 'Sean',
        last_name: 'Test Two',
        phone: '447526126716',
        email: 'sean2@test.com',
        company: 'Acme Corp'
      },
      {
        campaign_id: campaign.id,
        organization_id: campaign.organization_id,
        first_name: 'Sean',
        last_name: 'Test Three',
        phone: '447526126716',
        email: 'sean3@test.com',
        company: 'Tech Inc'
      }
    ];
    
    console.log('Adding 3 test leads...');
    
    const { data, error } = await supabase
      .from('campaign_contacts')
      .insert(testLeads);
    
    if (error) {
      console.error('❌ Error adding leads:', error);
      return;
    }
    
    console.log('✅ Successfully added 3 test leads!');
    console.log('\n📞 The campaign executor will process these within 1 minute.');
    console.log('Watch your backend logs for:');
    console.log('  - "📋 Processing X campaigns..."');
    console.log('  - Messages about creating queue entries');
    console.log('  - Messages about making calls');
    
    // Check current status
    const { data: contacts } = await supabase
      .from('campaign_contacts')
      .select('*')
      .eq('campaign_id', campaign.id);
    
    console.log(`\nCampaign now has ${contacts?.length || 0} contacts ready to call.`);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

addLeadsToCampaign();