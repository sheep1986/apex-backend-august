#!/usr/bin/env node

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://twigokrtbvigiqnaybfy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function testWebhookSetup() {
  console.log('🔍 VAPI Webhook Setup Instructions\n');
  
  try {
    // Get organization VAPI credentials
    const orgId = '2566d8c5-2245-4a3c-b539-4cea21a07d9b';
    const { data: org } = await supabase
      .from('organizations')
      .select('vapi_api_key, vapi_private_key')
      .eq('id', orgId)
      .single();
    
    const apiKey = org?.vapi_private_key || process.env.VAPI_API_KEY;
    
    if (!apiKey) {
      console.error('❌ No VAPI API key found!');
      return;
    }
    
    console.log('✅ VAPI API Key found\n');
    
    // Get webhook configuration from backend
    try {
      const backendResponse = await axios.get('http://localhost:3001/api/vapi-automation-webhook/config');
      console.log('📡 Backend Webhook Configuration:');
      console.log(`  URL: ${backendResponse.data.webhookUrl}`);
      console.log(`  Has Secret: ${backendResponse.data.hasSecret}`);
      console.log(`  Verification: ${backendResponse.data.verificationEnabled}\n`);
    } catch (err) {
      console.log('⚠️ Could not reach backend. Make sure it\'s running on port 3001\n');
    }
    
    console.log('🔧 VAPI Webhook Setup Steps:\n');
    console.log('1. Go to VAPI Dashboard: https://dashboard.vapi.ai');
    console.log('2. Navigate to "Webhooks" section');
    console.log('3. Click "Create Webhook" or edit existing webhook');
    console.log('4. Configure the webhook with these settings:\n');
    
    console.log('   📌 Webhook URL:');
    console.log('   For local development (choose one):');
    console.log('   - If using ngrok: https://YOUR-NGROK-URL.ngrok-free.app/api/vapi-automation-webhook');
    console.log('   - If using localtunnel: https://YOUR-SUBDOMAIN.loca.lt/api/vapi-automation-webhook');
    console.log('   - Direct local (only if VAPI can reach your machine): http://localhost:3001/api/vapi-automation-webhook\n');
    
    console.log('   📌 Events to Subscribe:');
    console.log('   ✓ call.started');
    console.log('   ✓ call.ended\n');
    
    console.log('   📌 Authentication (if required):');
    console.log('   - Method: Bearer Token or Custom Header');
    console.log('   - Secret: ' + (process.env.VAPI_WEBHOOK_SECRET || 'Not set - add VAPI_WEBHOOK_SECRET to .env'));
    console.log('\n');
    
    console.log('5. Save the webhook configuration in VAPI\n');
    
    console.log('📝 For Local Testing with ngrok:\n');
    console.log('   # Install ngrok if not already installed');
    console.log('   brew install ngrok  # or download from https://ngrok.com\n');
    console.log('   # Start ngrok tunnel');
    console.log('   ngrok http 3001\n');
    console.log('   # Copy the HTTPS URL from ngrok and use it in VAPI webhook settings\n');
    
    console.log('🧪 Test the Webhook:\n');
    console.log('1. After configuring the webhook in VAPI, make a test call');
    console.log('2. Watch the backend logs for webhook events:');
    console.log('   - "📨 Received VAPI webhook: call-started"');
    console.log('   - "📨 Received VAPI webhook: call-ended"');
    console.log('3. Check if calls table is updated with results\n');
    
    // Check recent calls
    const { data: recentCalls } = await supabase
      .from('calls')
      .select('id, status, duration, transcript, updated_at')
      .order('created_at', { ascending: false })
      .limit(3);
    
    if (recentCalls && recentCalls.length > 0) {
      console.log('📊 Recent Calls Status:');
      recentCalls.forEach((call, index) => {
        console.log(`\n${index + 1}. Call ${call.id}:`);
        console.log(`   Status: ${call.status}`);
        console.log(`   Duration: ${call.duration || 'Not set (webhook not processed)'}`);
        console.log(`   Transcript: ${call.transcript ? 'Yes' : 'No (webhook not processed)'}`);
        console.log(`   Updated: ${call.updated_at}`);
      });
      
      const pendingCalls = recentCalls.filter(c => c.status === 'pending');
      if (pendingCalls.length > 0) {
        console.log('\n⚠️ You have pending calls that haven\'t been processed by webhooks!');
        console.log('This indicates webhooks are not configured correctly in VAPI.');
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testWebhookSetup();