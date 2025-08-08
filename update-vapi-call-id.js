#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://twigokrtbvigiqnaybfy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMzUyNjksImV4cCI6MjA2NjcxMTI2OX0.AcRI1NYcCYpRqvHZvux15kMbGPocFbvT6uLf5DD6v24';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function updateVapiCallId() {
  console.log('🔄 Updating VAPI call ID and processing call data...\n');
  
  try {
    // The VAPI call we found
    const vapiCallId = '9cac9284-9cd3-4359-ae7d-30b1aadc337c';
    const phoneNumber = '+447526126716';
    
    // Find the most recent call to this number
    const { data: recentCalls } = await supabase
      .from('calls')
      .select('*')
      .eq('to_number', phoneNumber)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (!recentCalls || recentCalls.length === 0) {
      console.log('No calls found to that phone number. Checking without + prefix...');
      
      // Try without + prefix
      const { data: callsWithoutPlus } = await supabase
        .from('calls')
        .select('*')
        .eq('to_number', '447526126716')
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (callsWithoutPlus && callsWithoutPlus.length > 0) {
        recentCalls.push(callsWithoutPlus[0]);
      }
    }
    
    if (!recentCalls || recentCalls.length === 0) {
      console.log('Still no calls found. Let me check all recent calls...');
      
      // Get all recent calls
      const { data: allCalls } = await supabase
        .from('calls')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      
      console.log('\nRecent calls:');
      allCalls?.forEach(call => {
        console.log(`  ID: ${call.id}, To: ${call.to_number}, Status: ${call.status}`);
      });
      
      // Find the most likely call (most recent initiated call)
      const initiatedCall = allCalls?.find(c => c.status === 'initiated');
      if (initiatedCall) {
        console.log(`\nFound initiated call: ${initiatedCall.id}`);
        
        // Update with VAPI call ID
        const { error } = await supabase
          .from('calls')
          .update({
            vapi_call_id: vapiCallId,
            to_number: phoneNumber,
            // Keep status as initiated - we'll process it after
          })
          .eq('id', initiatedCall.id);
        
        if (error) {
          console.error('Error updating call:', error);
        } else {
          console.log('✅ Updated call with VAPI ID');
          
          // Now run the sync script to process this call
          console.log('\n📤 Now syncing VAPI data...\n');
          require('./sync-vapi-calls.js');
        }
      }
    } else {
      const call = recentCalls[0];
      console.log(`Found call: ${call.id} to ${call.to_number}`);
      
      // Update with VAPI call ID
      const { error } = await supabase
        .from('calls')
        .update({
          vapi_call_id: vapiCallId,
          status: 'pending' // Ensure it's pending so we can process it
        })
        .eq('id', call.id);
      
      if (error) {
        console.error('Error updating call:', error);
      } else {
        console.log('✅ Updated call with VAPI ID');
        
        // Now run the sync script to process this call
        console.log('\n📤 Now syncing VAPI data...\n');
        require('./sync-vapi-calls.js');
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

updateVapiCallId();