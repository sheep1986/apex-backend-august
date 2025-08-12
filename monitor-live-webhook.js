#!/usr/bin/env node

/**
 * Monitor live webhook data from VAPI
 * Run this while making a test call to see the data flow
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function monitorWebhook() {
  console.log('🔍 Monitoring VAPI Webhook Activity\n');
  console.log('=' .repeat(60));
  console.log('Watching for new calls... (Press Ctrl+C to stop)\n');
  
  let lastCheckTime = new Date();
  
  setInterval(async () => {
    // Check for new calls
    const { data: newCalls, error } = await supabase
      .from('calls')
      .select('*')
      .gte('created_at', lastCheckTime.toISOString())
      .order('created_at', { ascending: false });
    
    if (newCalls && newCalls.length > 0) {
      console.log(`\n🔔 ${new Date().toLocaleTimeString()} - New activity detected!`);
      
      for (const call of newCalls) {
        console.log('\n📞 New Call:');
        console.log(`  ID: ${call.id}`);
        console.log(`  VAPI ID: ${call.vapi_call_id || 'Waiting...'}`);
        console.log(`  Phone: ${call.phone_number}`);
        console.log(`  Status: ${call.status}`);
        console.log(`  Duration: ${call.duration || 0} seconds`);
        console.log(`  Cost: $${call.cost || 0}`);
        console.log(`  Outcome: ${call.outcome || 'Processing...'}`);
        console.log(`  Transcript: ${call.transcript ? 'Yes ✅' : 'Waiting...'}`);
        
        if (call.status === 'completed' && call.duration > 0) {
          console.log('\n✅ Call processed successfully!');
        } else if (call.status === 'failed') {
          console.log('\n❌ Call failed - check VAPI dashboard');
        } else {
          console.log('\n⏳ Call in progress...');
        }
      }
      
      lastCheckTime = new Date();
    }
  }, 2000); // Check every 2 seconds
  
  // Also check for recent calls
  const { data: recentCalls } = await supabase
    .from('calls')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(3);
  
  if (recentCalls && recentCalls.length > 0) {
    console.log('📊 Recent calls:\n');
    for (const call of recentCalls) {
      const time = new Date(call.created_at).toLocaleString();
      console.log(`  ${time} - ${call.phone_number} - ${call.status} - $${call.cost || 0}`);
    }
  }
  
  console.log('\n' + '=' .repeat(60));
  console.log('Monitoring... Make a test call now!');
}

// Start monitoring
monitorWebhook().catch(console.error);