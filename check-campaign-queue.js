#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://twigokrtbvigiqnaybfy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function checkCampaignQueue() {
  console.log('🔍 Checking campaign queue status...\n');
  
  const campaignId = 'ffebea3e-8caa-4b70-bdea-c1ce068787ca'; // Your Test campaign
  
  try {
    // Check campaign
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();
    
    console.log(`Campaign: ${campaign.name}`);
    console.log(`Status: ${campaign.status}`);
    console.log(`Organization: ${campaign.organization_id}\n`);
    
    // Check contacts
    const { data: contacts } = await supabase
      .from('campaign_contacts')
      .select('*')
      .eq('campaign_id', campaignId);
    
    console.log(`Contacts in campaign: ${contacts?.length || 0}`);
    if (contacts && contacts.length > 0) {
      console.log('First contact:', contacts[0].first_name, contacts[0].phone);
    }
    
    // Check queue
    const { data: queueItems } = await supabase
      .from('call_queue')
      .select('*')
      .eq('campaign_id', campaignId);
    
    console.log(`\nItems in call queue: ${queueItems?.length || 0}`);
    if (queueItems && queueItems.length > 0) {
      console.log('Queue statuses:');
      const statusCounts = {};
      queueItems.forEach(item => {
        statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
      });
      Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`);
      });
    }
    
    // Check calls
    const { data: calls } = await supabase
      .from('calls')
      .select('*')
      .eq('campaign_id', campaignId);
    
    console.log(`\nCalls made: ${calls?.length || 0}`);
    
    console.log('\n📊 Summary:');
    if (contacts?.length > 0 && queueItems?.length === 0) {
      console.log('❌ Contacts exist but no queue entries - campaign executor not processing');
      console.log('Check backend logs for errors');
    } else if (queueItems?.length > 0) {
      console.log('✅ Queue entries exist - calls should be processing');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkCampaignQueue();