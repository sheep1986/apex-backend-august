#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://twigokrtbvigiqnaybfy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMzUyNjksImV4cCI6MjA2NjcxMTI2OX0.AcRI1NYcCYpRqvHZvux15kMbGPocFbvT6uLf5DD6v24';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function cleanupStuckCalls() {
  console.log('🧹 Cleaning up stuck initiated calls...\n');
  
  try {
    // First, let's see what we're about to delete
    const { data: callsToDelete, error: selectError } = await supabase
      .from('calls')
      .select('id, status, vapi_call_id, created_at, campaign_id')
      .eq('status', 'initiated')
      .is('vapi_call_id', null);
    
    if (selectError) {
      console.error('❌ Error selecting calls:', selectError);
      return;
    }
    
    console.log(`Found ${callsToDelete.length} stuck initiated calls:\n`);
    
    // Group by campaign
    const byCampaign = callsToDelete.reduce((acc, call) => {
      acc[call.campaign_id] = (acc[call.campaign_id] || 0) + 1;
      return acc;
    }, {});
    
    Object.entries(byCampaign).forEach(([campaignId, count]) => {
      console.log(`  Campaign ${campaignId}: ${count} calls`);
    });
    
    if (callsToDelete.length === 0) {
      console.log('✅ No stuck calls to clean up!');
      return;
    }
    
    // Show some details
    console.log('\nSample calls to be deleted:');
    callsToDelete.slice(0, 5).forEach(call => {
      console.log(`  - ${call.id} (created: ${new Date(call.created_at).toLocaleString()})`);
    });
    
    // Delete the stuck calls
    const { error: deleteError } = await supabase
      .from('calls')
      .delete()
      .eq('status', 'initiated')
      .is('vapi_call_id', null);
    
    if (deleteError) {
      console.error('❌ Error deleting calls:', deleteError);
      return;
    }
    
    console.log(`\n✅ Successfully cleaned up ${callsToDelete.length} stuck initiated calls`);
    
    // Show remaining calls for the main campaign
    const campaignId = 'd5483845-e373-4917-bb7d-dc3036cc0928';
    const { data: remainingCalls } = await supabase
      .from('calls')
      .select('id, status, duration')
      .eq('campaign_id', campaignId);
    
    console.log(`\nRemaining calls in campaign ${campaignId}:`);
    console.log(`  Total: ${remainingCalls?.length || 0}`);
    if (remainingCalls && remainingCalls.length > 0) {
      const completed = remainingCalls.filter(c => c.status === 'completed').length;
      console.log(`  Completed: ${completed}`);
      console.log(`  Other: ${remainingCalls.length - completed}`);
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

cleanupStuckCalls();