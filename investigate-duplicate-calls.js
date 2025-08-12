#!/usr/bin/env node

/**
 * Investigate duplicate call issue and stuck "In Progress" status
 * Problem: Single VAPI call creates 2 database records, both stuck at "In Progress"
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function investigateDuplicateCalls() {
  console.log('🔍 Investigating Duplicate Call Issue\n');
  console.log('=' .repeat(60));

  // 1. Check the two duplicate calls
  console.log('\n📞 Checking duplicate calls for Matt (+35699071143)...\n');
  
  const { data: calls, error } = await supabase
    .from('calls')
    .select('*')
    .eq('phone_number', '+35699071143')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('❌ Error fetching calls:', error);
    return;
  }

  console.log(`Found ${calls.length} calls to this number:\n`);
  
  calls.forEach((call, index) => {
    console.log(`Call ${index + 1}:`);
    console.log(`  ID: ${call.id}`);
    console.log(`  VAPI Call ID: ${call.vapi_call_id || 'NULL'}`);
    console.log(`  Status: ${call.status}`);
    console.log(`  Duration: ${call.duration || 0} seconds`);
    console.log(`  Cost: $${call.cost || 0}`);
    console.log(`  Campaign: ${call.campaign_id}`);
    console.log(`  Created: ${call.created_at}`);
    console.log(`  Started: ${call.started_at || 'Not set'}`);
    console.log(`  Ended: ${call.ended_at || 'Not set'}`);
    console.log(`  Has Transcript: ${call.transcript ? 'Yes' : 'No'}`);
    console.log(`  Recording URL: ${call.recording_url ? 'Yes' : 'No'}`);
    console.log(`  Outcome: ${call.outcome || 'Not set'}`);
    console.log('  ---');
  });

  // 2. Check campaign settings
  console.log('\n📊 Checking campaign settings...\n');
  
  if (calls.length > 0 && calls[0].campaign_id) {
    const { data: campaign, error: campError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', calls[0].campaign_id)
      .single();

    if (!campError && campaign) {
      console.log('Campaign: ' + campaign.name);
      console.log('Status: ' + campaign.status);
      console.log('Calls per day: ' + (campaign.calls_per_day || 'Not set'));
      console.log('Working hours: ' + (campaign.working_hours_start || 'Not set') + ' - ' + (campaign.working_hours_end || 'Not set'));
    }
  }

  // 3. Check for webhook logs
  console.log('\n🔔 Checking webhook logs...\n');
  
  const vapiCallIds = [...new Set(calls.filter(c => c.vapi_call_id).map(c => c.vapi_call_id))];
  
  if (vapiCallIds.length > 0) {
    console.log('Unique VAPI Call IDs found:', vapiCallIds);
    
    // Check if webhook_logs table exists
    const { data: webhookLogs, error: webhookError } = await supabase
      .from('webhook_logs')
      .select('*')
      .in('call_id', vapiCallIds)
      .order('received_at', { ascending: false })
      .limit(10);

    if (!webhookError && webhookLogs) {
      console.log(`\nFound ${webhookLogs.length} webhook logs`);
      webhookLogs.forEach(log => {
        console.log(`  ${log.event_type} at ${log.received_at} - Status: ${log.status}`);
      });
    } else if (webhookError) {
      console.log('⚠️  webhook_logs table not accessible or doesn\'t exist');
    }
  }

  // 4. Check call queue
  console.log('\n📋 Checking call queue...\n');
  
  const { data: queueItems, error: queueError } = await supabase
    .from('call_queue')
    .select('*')
    .eq('contact_phone', '+35699071143')
    .order('created_at', { ascending: false })
    .limit(5);

  if (!queueError && queueItems) {
    console.log(`Found ${queueItems.length} queue items for this number`);
    queueItems.forEach(item => {
      console.log(`  Status: ${item.status}, Attempts: ${item.attempts}, Created: ${item.created_at}`);
    });
  } else {
    console.log('⚠️  call_queue table not accessible or doesn\'t exist');
  }

  // 5. Analysis and recommendations
  console.log('\n' + '=' .repeat(60));
  console.log('📊 ANALYSIS:\n');

  if (calls.length > 1) {
    // Check if calls have same VAPI ID
    const sameVapiId = calls[0].vapi_call_id && calls[1].vapi_call_id && 
                       calls[0].vapi_call_id === calls[1].vapi_call_id;
    
    if (sameVapiId) {
      console.log('❌ PROBLEM: Multiple database records with SAME VAPI Call ID');
      console.log('   This suggests webhook is being processed multiple times');
    } else if (!calls[0].vapi_call_id || !calls[1].vapi_call_id) {
      console.log('❌ PROBLEM: Calls missing VAPI Call ID');
      console.log('   This suggests calls are being created before VAPI responds');
    } else {
      console.log('❌ PROBLEM: Multiple calls with different VAPI IDs');
      console.log('   This suggests campaign executor is creating duplicate calls');
    }
  }

  if (calls.some(c => c.status === 'in_progress' && !c.ended_at)) {
    console.log('\n⚠️  ISSUE: Calls stuck in "in_progress" status');
    console.log('   Webhook may not be receiving or processing call-ended events');
  }

  if (calls.every(c => !c.duration && !c.cost)) {
    console.log('\n⚠️  ISSUE: Missing duration and cost data');
    console.log('   VAPI webhook data not being captured properly');
  }

  console.log('\n🔧 RECOMMENDED FIXES:');
  console.log('1. Check if VAPI webhook is configured correctly in VAPI dashboard');
  console.log('2. Verify webhook URL is accessible from VAPI servers');
  console.log('3. Check Railway logs for webhook reception');
  console.log('4. Implement idempotency checks to prevent duplicate processing');
  console.log('5. Add distributed locking to prevent duplicate call creation');
  console.log('6. Ensure webhook responds with 200 immediately to prevent retries');
}

// Run investigation
investigateDuplicateCalls().catch(console.error);