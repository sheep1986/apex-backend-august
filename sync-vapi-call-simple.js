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

async function syncVapiCall() {
  console.log('🔄 Syncing specific VAPI call...\n');
  
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
    
    // The VAPI call we found
    const vapiCallId = '9cac9284-9cd3-4359-ae7d-30b1aadc337c';
    
    // Fetch call details from VAPI
    console.log(`📞 Fetching VAPI call ${vapiCallId}...`);
    const response = await axios.get(
      `https://api.vapi.ai/call/${vapiCallId}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const vapiCall = response.data;
    console.log(`\nVAPI Call Details:`);
    console.log(`  Status: ${vapiCall.status}`);
    console.log(`  Customer: ${vapiCall.customer?.name} (${vapiCall.customer?.number})`);
    console.log(`  Assistant ID: ${vapiCall.assistantId}`);
    console.log(`  Phone Number ID: ${vapiCall.phoneNumberId}`);
    console.log(`  Started: ${vapiCall.startedAt}`);
    console.log(`  Ended: ${vapiCall.endedAt}`);
    console.log(`  Duration: ${vapiCall.startedAt && vapiCall.endedAt ? 
      Math.round((new Date(vapiCall.endedAt) - new Date(vapiCall.startedAt)) / 1000) : 0} seconds`);
    console.log(`  Ended Reason: ${vapiCall.endedReason}`);
    console.log(`  Transcript Available: ${vapiCall.transcript ? 'Yes' : 'No'}`);
    console.log(`  Recording URL: ${vapiCall.recordingUrl || 'None'}`);
    console.log(`  Cost: $${vapiCall.cost || 0}`);
    
    if (vapiCall.transcript) {
      console.log(`\n📝 Transcript Preview:`);
      console.log(vapiCall.transcript.substring(0, 200) + '...');
    }
    
    // Find the most recent initiated call and update it
    const { data: recentCall } = await supabase
      .from('calls')
      .select('*')
      .eq('status', 'initiated')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (recentCall) {
      console.log(`\n📊 Updating call ${recentCall.id} with VAPI data...`);
      
      const duration = vapiCall.startedAt && vapiCall.endedAt
        ? Math.round((new Date(vapiCall.endedAt) - new Date(vapiCall.startedAt)) / 1000)
        : 0;
      
      // Determine outcome - must be null for calls table (outcome is only for leads)
      let outcome = null; // calls table doesn't have outcome constraint
      
      // For lead creation, we'll use these outcomes
      let leadOutcome = 'interested'; // Default for completed calls
      if (vapiCall.endedReason === 'silence-timeout' || duration < 10) {
        leadOutcome = 'no_answer';
      } else if (duration < 30) {
        leadOutcome = 'not_interested';
      }
      
      const { error: updateError } = await supabase
        .from('calls')
        .update({
          vapi_call_id: vapiCallId,
          to_number: vapiCall.customer?.number,
          status: 'completed',
          outcome,
          duration,
          transcript: vapiCall.transcript || null,
          summary: vapiCall.summary || null,
          recording_url: vapiCall.recordingUrl || vapiCall.stereoRecordingUrl || null,
          cost: vapiCall.cost || 0,
          started_at: vapiCall.startedAt,
          ended_at: vapiCall.endedAt,
          updated_at: new Date().toISOString()
        })
        .eq('id', recentCall.id);
      
      if (updateError) {
        console.error(`❌ Error updating call:`, updateError);
      } else {
        console.log(`✅ Successfully updated call with VAPI data!`);
        console.log(`   Outcome: ${outcome}`);
        console.log(`   Duration: ${duration} seconds`);
        
        // Update call_queue if exists
        const { data: queueEntry } = await supabase
          .from('call_queue')
          .select('*')
          .eq('contact_id', recentCall.lead_id)
          .single();
        
        if (queueEntry) {
          await supabase
            .from('call_queue')
            .update({
              status: 'completed',
              external_call_id: vapiCallId,
              updated_at: new Date().toISOString()
            })
            .eq('id', queueEntry.id);
          
          console.log('✅ Updated call_queue entry');
        }
        
        // Create lead if call was successful (duration > 30 seconds)
        if (duration > 30 && recentCall.lead_id) {
          const { data: contact } = await supabase
            .from('campaign_contacts')
            .select('*')
            .eq('id', recentCall.lead_id)
            .single();
          
          if (contact) {
            const { data: newLead, error: leadError } = await supabase
              .from('leads')
              .insert({
                organization_id: recentCall.organization_id,
                campaign_id: recentCall.campaign_id,
                call_id: recentCall.id,
                name: `${contact.first_name} ${contact.last_name}`,
                email: contact.email,
                phone: contact.phone,
                company: contact.company,
                status: 'qualified',
                score: 80,
                notes: `Call duration: ${duration}s. ${vapiCall.summary || ''}`,
                source: 'vapi_call',
                created_at: new Date().toISOString()
              })
              .select()
              .single();
            
            if (!leadError) {
              console.log('✅ Created lead from successful call');
            }
          }
        }
      }
    } else {
      console.log('\n⚠️ No initiated calls found to update');
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

syncVapiCall();