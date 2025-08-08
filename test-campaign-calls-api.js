#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://twigokrtbvigiqnaybfy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMzUyNjksImV4cCI6MjA2NjcxMTI2OX0.AcRI1NYcCYpRqvHZvux15kMbGPocFbvT6uLf5DD6v24';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testCampaignCallsAPI() {
  console.log('🔍 Testing Campaign Calls API...\n');
  
  try {
    // Get the campaign ID
    const campaignId = 'd5483845-e373-4917-bb7d-dc3036cc0928';
    const organizationId = '2566d8c5-2245-4a3c-b539-4cea21a07d9b';
    
    console.log(`Campaign ID: ${campaignId}`);
    console.log(`Organization ID: ${organizationId}\n`);
    
    // Test the query that the API uses
    console.log('📞 Fetching calls for campaign...');
    
    const { data: calls, error } = await supabase
      .from('calls')
      .select(`
        id,
        vapi_call_id,
        lead_id,
        to_number,
        phone_number,
        direction,
        status,
        started_at,
        ended_at,
        duration,
        cost,
        transcript,
        summary,
        recording_url,
        sentiment,
        ai_confidence_score,
        customer_name,
        leads(first_name, last_name, email, company)
      `)
      .eq('campaign_id', campaignId)
      .eq('organization_id', organizationId);
    
    if (error) {
      console.error('❌ Error fetching calls:', error);
      return;
    }
    
    console.log(`\n✅ Found ${calls?.length || 0} calls`);
    
    if (calls && calls.length > 0) {
      console.log('\nCall details:');
      calls.forEach((call, idx) => {
        console.log(`\n${idx + 1}. Call ${call.id}`);
        console.log(`   Status: ${call.status}`);
        console.log(`   To: ${call.to_number || call.phone_number}`);
        console.log(`   Duration: ${call.duration}s`);
        console.log(`   Cost: $${call.cost || 0}`);
        console.log(`   Has Transcript: ${!!call.transcript}`);
        console.log(`   Has Recording: ${!!call.recording_url}`);
        console.log(`   Lead: ${call.leads ? `${call.leads.first_name} ${call.leads.last_name}` : 'No lead'}`);
      });
    } else {
      console.log('\n⚠️ No calls found for this campaign');
      
      // Check if there are any calls at all
      const { data: allCalls, count } = await supabase
        .from('calls')
        .select('campaign_id, status', { count: 'exact' })
        .eq('organization_id', organizationId);
      
      console.log(`\nTotal calls in organization: ${count || 0}`);
      
      if (allCalls && allCalls.length > 0) {
        const campaignGroups = allCalls.reduce((acc, call) => {
          acc[call.campaign_id] = (acc[call.campaign_id] || 0) + 1;
          return acc;
        }, {});
        
        console.log('\nCalls by campaign:');
        Object.entries(campaignGroups).forEach(([cId, count]) => {
          console.log(`  ${cId}: ${count} calls`);
        });
      }
    }
    
    // Test the API endpoint directly
    console.log('\n🔧 Testing API endpoint...');
    console.log(`URL: http://localhost:3001/api/vapi-outbound/campaigns/${campaignId}/calls`);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testCampaignCallsAPI();