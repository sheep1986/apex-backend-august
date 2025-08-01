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

async function syncVapiCalls() {
  console.log('🔄 Syncing VAPI call data...\n');
  
  try {
    // Get organization VAPI credentials
    const orgId = '2566d8c5-2245-4a3c-b539-4cea21a07d9b';
    const { data: org } = await supabase
      .from('organizations')
      .select('vapi_private_key')
      .eq('id', orgId)
      .single();
    
    const apiKey = org?.vapi_private_key || process.env.VAPI_API_KEY;
    
    if (!apiKey) {
      console.error('❌ No VAPI API key found!');
      return;
    }
    
    // Get ALL calls from our database that have vapi_call_id (not just pending)
    const { data: allCalls } = await supabase
      .from('calls')
      .select('*')
      .not('vapi_call_id', 'is', null)
      .order('created_at', { ascending: false });
    
    console.log(`Found ${allCalls?.length || 0} calls with VAPI IDs to sync\n`);
    
    // First, fetch detailed info for each call we have
    for (const call of allCalls || []) {
      console.log(`\n📞 Fetching details for ${call.customer_name} (VAPI ID: ${call.vapi_call_id})`);
      
      try {
        const callResponse = await axios.get(
          `https://api.vapi.ai/call/${call.vapi_call_id}`,
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        const vapiCall = callResponse.data;
        console.log(`  Status: ${vapiCall.status}`);
        console.log(`  Recording: ${vapiCall.recordingUrl ? 'Available' : 'Not available'}`);
        console.log(`  Transcript: ${vapiCall.transcript ? 'Available' : 'Not available'}`);
        
        // Update our database with VAPI data
        const updates = {
          updated_at: new Date().toISOString()
        };
        
        if (vapiCall.recordingUrl) {
          updates.recording_url = vapiCall.recordingUrl;
        }
        
        if (vapiCall.stereoRecordingUrl) {
          // Prefer stereo recording if available
          updates.recording_url = vapiCall.stereoRecordingUrl;
        }
        
        if (vapiCall.transcript) {
          updates.transcript = typeof vapiCall.transcript === 'string' 
            ? vapiCall.transcript 
            : JSON.stringify(vapiCall.transcript);
        }
        
        if (vapiCall.summary) {
          updates.summary = vapiCall.summary;
        }
        
        if (vapiCall.cost) {
          updates.cost = vapiCall.cost;
        }
        
        // Update the call
        const { error: updateError } = await supabase
          .from('calls')
          .update(updates)
          .eq('id', call.id);
        
        if (updateError) {
          console.error(`  ❌ Error updating call: ${updateError.message}`);
        } else {
          console.log(`  ✅ Updated call with VAPI data`);
        }
        
      } catch (fetchError) {
        console.error(`  ❌ Error fetching call from VAPI:`, fetchError.response?.data || fetchError.message);
      }
    }
    
    // Also get recent calls from VAPI to ensure we don't miss any
    console.log('\n📡 Fetching recent calls from VAPI API...');
    try {
      const response = await axios.get(
        'https://api.vapi.ai/call',
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          params: {
            limit: 50,
            createdAtGt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // Last 24 hours
          }
        }
      );
      
      const vapiCalls = response.data;
      console.log(`Retrieved ${vapiCalls.length} calls from VAPI\n`);
      
      // Process each VAPI call
      for (const vapiCall of vapiCalls) {
        console.log(`Processing VAPI call ${vapiCall.id}...`);
        console.log(`  Status: ${vapiCall.status}`);
        console.log(`  Customer: ${vapiCall.customer?.name} (${vapiCall.customer?.number})`);
        
        if (vapiCall.status === 'ended') {
          console.log(`  Duration: ${vapiCall.startedAt && vapiCall.endedAt ? 
            Math.round((new Date(vapiCall.endedAt) - new Date(vapiCall.startedAt)) / 1000) : 0} seconds`);
          console.log(`  Transcript: ${vapiCall.transcript ? 'Yes' : 'No'}`);
          console.log(`  Recording: ${vapiCall.recordingUrl ? 'Yes' : 'No'}`);
          console.log(`  Cost: $${vapiCall.cost || 0}`);
          
          // Check if we have this call in our database
          const { data: existingCall } = await supabase
            .from('calls')
            .select('*')
            .eq('vapi_call_id', vapiCall.id)
            .single();
          
          if (existingCall) {
            // Update existing call
            const duration = vapiCall.startedAt && vapiCall.endedAt
              ? Math.round((new Date(vapiCall.endedAt) - new Date(vapiCall.startedAt)) / 1000)
              : 0;
            
            // Determine outcome
            let outcome = 'completed';
            if (vapiCall.endedReason === 'silence-timeout' || duration < 10) {
              outcome = 'no_answer';
            } else if (duration < 30) {
              outcome = 'quick_hangup';
            }
            
            const { error: updateError } = await supabase
              .from('calls')
              .update({
                status: 'completed',
                outcome,
                duration,
                transcript: vapiCall.transcript || null,
                summary: vapiCall.summary || null,
                recording_url: vapiCall.recordingUrl || vapiCall.stereoRecordingUrl || null,
                cost: vapiCall.cost || 0,
                ended_at: vapiCall.endedAt,
                call_data: vapiCall, // Store full VAPI response
                updated_at: new Date().toISOString()
              })
              .eq('id', existingCall.id);
            
            if (updateError) {
              console.error(`  ❌ Error updating call: ${updateError.message}`);
            } else {
              console.log(`  ✅ Updated call with outcome: ${outcome}`);
              
              // Also update call_queue if needed
              if (existingCall.call_queue_id) {
                await supabase
                  .from('call_queue')
                  .update({
                    status: 'completed',
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', existingCall.call_queue_id);
              }
              
              // Process for lead creation if call was successful
              if (outcome === 'completed' || outcome === 'answered') {
                await processCallForLeadCreation(existingCall, vapiCall);
              }
            }
          } else {
            console.log(`  ⚠️ Call not found in our database`);
          }
        }
      }
      
    } catch (vapiError) {
      console.error('❌ Error fetching VAPI calls:', vapiError.response?.data || vapiError.message);
    }
    
    // Get organization usage/credits
    console.log('\n📊 Fetching VAPI organization usage...');
    try {
      const orgResponse = await axios.get(
        'https://api.vapi.ai/org',
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('\nVAPI Organization Info:');
      console.log(`  Name: ${orgResponse.data.name}`);
      console.log(`  Credits Used: ${orgResponse.data.creditsUsed || 0}`);
      console.log(`  Credits Remaining: ${orgResponse.data.creditsRemaining || 'N/A'}`);
      console.log(`  Concurrency Limit: ${orgResponse.data.concurrencyLimit || 10}`);
      
    } catch (orgError) {
      console.error('❌ Error fetching organization info:', orgError.response?.data || orgError.message);
    }
    
    console.log('\n✅ Sync complete!');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

async function processCallForLeadCreation(call, vapiCall) {
  try {
    // Check if lead already exists
    const { data: existingLead } = await supabase
      .from('leads')
      .select('*')
      .eq('call_id', call.id)
      .single();
    
    if (existingLead) {
      console.log('    Lead already exists');
      return;
    }
    
    // Get campaign contact info
    const { data: contact } = await supabase
      .from('campaign_contacts')
      .select('*')
      .eq('id', call.contact_id)
      .single();
    
    if (!contact) {
      console.log('    No contact found for call');
      return;
    }
    
    // Create lead
    const { data: newLead, error: leadError } = await supabase
      .from('leads')
      .insert({
        organization_id: call.organization_id,
        campaign_id: call.campaign_id,
        call_id: call.id,
        name: contact.first_name + ' ' + contact.last_name,
        email: contact.email,
        phone: contact.phone,
        company: contact.company,
        status: 'qualified',
        score: 80, // Default score, should be calculated by AI
        notes: `Call duration: ${call.duration}s. ${vapiCall.summary || ''}`,
        source: 'vapi_call',
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (leadError) {
      console.error('    ❌ Error creating lead:', leadError.message);
    } else {
      console.log('    ✅ Created lead:', newLead.id);
      
      // Update call with lead_id
      await supabase
        .from('calls')
        .update({ lead_id: newLead.id })
        .eq('id', call.id);
    }
    
  } catch (error) {
    console.error('    Error processing lead creation:', error);
  }
}

// Run the sync
syncVapiCalls();

// Optional: Set up interval to run every 5 minutes
if (process.argv.includes('--continuous')) {
  console.log('\n🔄 Running in continuous mode - syncing every 5 minutes');
  setInterval(syncVapiCalls, 5 * 60 * 1000);
}