#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://twigokrtbvigiqnaybfy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function debugCampaignExecutor() {
  console.log('🔍 Debugging Campaign Executor...\n');
  
  try {
    // 1. Check active campaigns
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    
    console.log(`📋 Found ${campaigns?.length || 0} active campaigns\n`);
    
    if (!campaigns || campaigns.length === 0) {
      console.log('❌ No active campaigns found!');
      return;
    }
    
    // Check the most recent campaign
    const campaign = campaigns[0];
    console.log(`Latest Campaign: ${campaign.name} (${campaign.id})`);
    console.log(`Created: ${campaign.created_at}`);
    console.log(`Organization: ${campaign.organization_id}`);
    console.log(`Status: ${campaign.status}`);
    
    // 2. Check contacts
    const { data: contacts } = await supabase
      .from('campaign_contacts')
      .select('*')
      .eq('campaign_id', campaign.id);
    
    console.log(`\n📞 Contacts: ${contacts?.length || 0}`);
    if (contacts && contacts.length > 0) {
      console.log('Sample contacts:');
      contacts.slice(0, 3).forEach(c => {
        console.log(`  - ${c.first_name} ${c.last_name}: ${c.phone}`);
      });
    }
    
    // 3. Check queue
    const { data: queue } = await supabase
      .from('call_queue')
      .select('*')
      .eq('campaign_id', campaign.id);
    
    console.log(`\n📦 Queue entries: ${queue?.length || 0}`);
    if (queue && queue.length > 0) {
      const statuses = {};
      queue.forEach(q => {
        statuses[q.status] = (statuses[q.status] || 0) + 1;
      });
      console.log('Queue status breakdown:');
      Object.entries(statuses).forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`);
      });
    }
    
    // 4. Check calls
    const { data: calls } = await supabase
      .from('calls')
      .select('*')
      .eq('campaign_id', campaign.id);
    
    console.log(`\n☎️ Calls made: ${calls?.length || 0}`);
    
    // 5. Check VAPI credentials
    const { data: org } = await supabase
      .from('organizations')
      .select('vapi_api_key, vapi_private_key')
      .eq('id', campaign.organization_id)
      .single();
    
    console.log(`\n🔐 VAPI Credentials:`);
    console.log(`  API Key: ${org?.vapi_api_key ? '✅ Set' : '❌ Missing'}`);
    console.log(`  Private Key: ${org?.vapi_private_key ? '✅ Set' : '❌ Missing'}`);
    
    // 6. Check backend environment
    console.log(`\n🌍 Backend Environment:`);
    console.log(`  VAPI_API_KEY env var: ${process.env.VAPI_API_KEY ? '✅ Set' : '❌ Missing'}`);
    console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
    
    // Diagnosis
    console.log('\n📊 Diagnosis:');
    if (contacts?.length > 0 && queue?.length === 0) {
      console.log('❌ Contacts exist but no queue entries created');
      console.log('   → Campaign executor is not processing this campaign');
      console.log('   → Check backend logs for errors');
    } else if (queue?.length > 0 && calls?.length === 0) {
      console.log('❌ Queue entries exist but no calls made');
      console.log('   → VAPI integration issue');
      console.log('   → Check VAPI credentials and backend logs');
    } else if (calls?.length > 0) {
      console.log('✅ Calls have been made!');
    }
    
    console.log('\n💡 Next Steps:');
    console.log('1. Check backend server logs for campaign executor messages');
    console.log('2. Look for "🚀 Campaign Executor started" every minute');
    console.log('3. Look for any error messages about VAPI or processing');
    console.log('4. Ensure backend .env has VAPI_API_KEY set');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugCampaignExecutor();