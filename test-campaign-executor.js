#!/usr/bin/env node

// Test script to manually trigger campaign processing
// Run from backend directory: node test-campaign-executor.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://twigokrtbvigiqnaybfy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function testCampaignExecutor() {
  console.log('🔍 Testing campaign executor...\n');
  
  try {
    // Get active campaigns
    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('*')
      .in('status', ['active', 'scheduled']);
    
    if (error) {
      console.error('❌ Error fetching campaigns:', error);
      return;
    }
    
    console.log(`📋 Found ${campaigns?.length || 0} active/scheduled campaigns\n`);
    
    if (campaigns && campaigns.length > 0) {
      for (const campaign of campaigns) {
        console.log(`Campaign: ${campaign.name} (${campaign.id})`);
        console.log(`  Status: ${campaign.status}`);
        console.log(`  Organization: ${campaign.organization_id}`);
        console.log(`  Assistant ID: ${campaign.assistant_id}`);
        console.log(`  Phone Number ID: ${campaign.phone_number_id}`);
        console.log(`  Created: ${campaign.created_at}`);
        
        // Check for leads in campaign_contacts
        const { data: contacts, error: contactsError, count: contactCount } = await supabase
          .from('campaign_contacts')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id);
        
        if (!contactsError) {
          console.log(`  Contacts: ${contactCount || 0}`);
        }
        
        // Check for existing calls
        const { data: calls, error: callsError, count: callCount } = await supabase
          .from('calls')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id);
        
        if (!callsError) {
          console.log(`  Calls made: ${callCount || 0}`);
        }
        
        // Check call queue
        const { data: queue, error: queueError, count: queueCount } = await supabase
          .from('call_queue')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id);
        
        if (!queueError) {
          console.log(`  In queue: ${queueCount || 0}`);
        } else if (queueError) {
          console.log(`  Queue check error: ${queueError.message}`);
        }
        
        console.log('');
      }
    }
    
    // Check if VAPI credentials exist for the organization
    const orgId = campaigns?.[0]?.organization_id;
    if (orgId) {
      console.log(`\n🔐 Checking VAPI credentials for org ${orgId}...`);
      
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select('vapi_api_key, vapi_private_key, vapi_settings')
        .eq('id', orgId)
        .single();
      
      if (!orgError && org) {
        console.log(`  Has vapi_api_key: ${!!org.vapi_api_key}`);
        console.log(`  Has vapi_private_key: ${!!org.vapi_private_key}`);
        console.log(`  Has vapi_settings: ${!!org.vapi_settings}`);
      }
    }
    
    console.log('\n📝 Notes:');
    console.log('- Campaign executor runs every minute');
    console.log('- It creates entries in call_queue table');
    console.log('- Then processes queue to make actual calls');
    console.log('- Check backend logs for "Processing X campaigns" messages');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testCampaignExecutor();