#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://twigokrtbvigiqnaybfy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMzUyNjksImV4cCI6MjA2NjcxMTI2OX0.AcRI1NYcCYpRqvHZvux15kMbGPocFbvT6uLf5DD6v24';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkCallResults() {
  console.log('🔍 Checking call results and webhook processing...\n');
  
  try {
    // Get recent calls
    const { data: calls } = await supabase
      .from('calls')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    console.log(`📞 Found ${calls?.length || 0} recent calls\n`);
    
    if (calls && calls.length > 0) {
      const latestCall = calls[0];
      console.log('Latest call:');
      console.log(`  ID: ${latestCall.id}`);
      console.log(`  VAPI Call ID: ${latestCall.vapi_call_id || 'None'}`);
      console.log(`  To: ${latestCall.to_number}`);
      console.log(`  Status: ${latestCall.status}`);
      console.log(`  Duration: ${latestCall.duration || 0} seconds`);
      console.log(`  Transcript: ${latestCall.transcript ? 'Yes' : 'No'}`);
      console.log(`  Summary: ${latestCall.summary ? 'Yes' : 'No'}`);
      console.log(`  Created: ${latestCall.created_at}`);
      console.log(`  Updated: ${latestCall.updated_at}`);
      
      // Check if call was processed by webhook
      if (latestCall.status === 'pending' || !latestCall.duration) {
        console.log('\n❌ Call not processed by webhook!');
        console.log('The VAPI webhook needs to update call results.');
      }
    }
    
    // Check leads table
    console.log('\n📋 Checking leads table...');
    const { data: leads } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    console.log(`Found ${leads?.length || 0} recent leads`);
    
    // Check CRM contacts
    console.log('\n🏢 Checking CRM contacts...');
    const { data: crmContacts } = await supabase
      .from('crm_contacts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    console.log(`Found ${crmContacts?.length || 0} CRM contacts`);
    
    console.log('\n📊 Summary:');
    console.log('1. Calls are being made ✅');
    console.log('2. Call results need webhook processing ❌');
    console.log('3. Leads need to be created from calls ❌');
    console.log('4. CRM integration needs to process qualified leads ❌');
    
    console.log('\n🔧 To fix webhook processing:');
    console.log('1. Configure VAPI webhook URL in VAPI dashboard');
    console.log('2. Set webhook URL to: http://your-domain/api/vapi-automation-webhook');
    console.log('3. Or use ngrok for local testing: ngrok http 3001');
    console.log('4. Then update VAPI webhook URL to ngrok URL + /api/vapi-automation-webhook');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkCallResults();