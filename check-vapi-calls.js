#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://twigokrtbvigiqnaybfy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMzUyNjksImV4cCI6MjA2NjcxMTI2OX0.AcRI1NYcCYpRqvHZvux15kMbGPocFbvT6uLf5DD6v24';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkVapiCalls() {
  console.log('🔍 Checking for calls with VAPI IDs...\n');
  
  try {
    // Get all calls
    const { data: allCalls } = await supabase
      .from('calls')
      .select('*')
      .order('created_at', { ascending: false });
    
    console.log(`Total calls in database: ${allCalls?.length || 0}\n`);
    
    // Filter calls with VAPI IDs
    const vapiCalls = allCalls?.filter(c => c.vapi_call_id) || [];
    console.log(`Calls with VAPI IDs: ${vapiCalls.length}`);
    
    if (vapiCalls.length > 0) {
      console.log('\n📞 Calls with VAPI IDs:');
      vapiCalls.forEach(call => {
        console.log(`\nCall ID: ${call.id}`);
        console.log(`  VAPI ID: ${call.vapi_call_id}`);
        console.log(`  Status: ${call.status}`);
        console.log(`  To: ${call.to_number}`);
        console.log(`  Duration: ${call.duration || 0}s`);
        console.log(`  Created: ${call.created_at}`);
      });
    }
    
    // Check call_queue table
    console.log('\n📋 Checking call_queue table...');
    const { data: queueEntries } = await supabase
      .from('call_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
    
    console.log(`Recent queue entries: ${queueEntries?.length || 0}`);
    
    if (queueEntries && queueEntries.length > 0) {
      const latest = queueEntries[0];
      console.log(`\nLatest queue entry:`);
      console.log(`  ID: ${latest.id}`);
      console.log(`  Status: ${latest.status}`);
      console.log(`  Phone: ${latest.phone_number}`);
      console.log(`  Name: ${latest.contact_name}`);
      console.log(`  External Call ID: ${latest.external_call_id || 'None'}`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkVapiCalls();