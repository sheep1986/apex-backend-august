const express = require('express');
const axios = require('axios');
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function debugCampaignAPI() {
  try {
    console.log('🔍 Debugging Campaign API endpoint...\n');

    // First, let's check what the API thinks the user's organization is
    const clerkUserId = 'user_2tFeS5bqmOFxmjLo1oStHCuDkxM'; // From your previous session
    
    // Check the user's organization from Clerk perspective
    console.log('Checking user with Clerk ID:', clerkUserId);
    
    // Get user from database
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('clerk_user_id', clerkUserId);
    
    if (users && users.length > 0) {
      const user = users[0];
      console.log('\n✅ Found user:');
      console.log('Email:', user.email);
      console.log('Organization ID:', user.organization_id);
      console.log('Status:', user.status);
      
      // Now check campaigns for this organization
      const { data: campaigns, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('organization_id', user.organization_id)
        .eq('type', 'outbound')
        .order('created_at', { ascending: false });
        
      console.log(`\n📢 Direct database query found ${campaigns?.length || 0} campaigns`);
      
      if (campaigns && campaigns.length > 0) {
        console.log('\nCampaigns:');
        campaigns.forEach(c => {
          console.log(`- ${c.name} (${c.status})`);
        });
      }
      
      // Check if VAPI integration service can be initialized
      console.log('\n🔧 Checking VAPI integration for organization...');
      const { data: org } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', user.organization_id)
        .single();
        
      if (org) {
        console.log('Organization has VAPI API key:', !!org.vapi_api_key);
        console.log('Organization has VAPI Private key:', !!org.vapi_private_key);
        console.log('Organization has settings.vapi:', !!(org.settings?.vapi));
      }
      
    } else {
      console.log('❌ No user found with Clerk ID:', clerkUserId);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

debugCampaignAPI();