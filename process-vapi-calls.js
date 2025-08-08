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

// Import the campaign executor to use its processCallResult method
const { CampaignExecutor } = require('./dist/services/campaign-executor');
const campaignExecutor = new CampaignExecutor();

async function processVapiCalls() {
  console.log('🔄 Processing VAPI calls through campaign executor...\n');
  
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
    
    // Get all pending calls
    const { data: pendingCalls } = await supabase
      .from('calls')
      .select('*')
      .eq('status', 'pending')
      .not('vapi_call_id', 'is', null);
    
    console.log(`Found ${pendingCalls?.length || 0} pending calls\n`);
    
    if (!pendingCalls || pendingCalls.length === 0) {
      console.log('No pending calls to process');
      return;
    }
    
    // Process each pending call
    for (const call of pendingCalls) {
      console.log(`📞 Processing call ${call.id} (VAPI: ${call.vapi_call_id})...`);
      
      try {
        // Fetch call details from VAPI
        const response = await axios.get(
          `https://api.vapi.ai/call/${call.vapi_call_id}`,
          {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        const vapiCall = response.data;
        console.log(`  Status: ${vapiCall.status}`);
        console.log(`  Customer: ${vapiCall.customer?.name} (${vapiCall.customer?.number})`);
        
        if (vapiCall.status === 'ended') {
          // Calculate duration
          const duration = vapiCall.startedAt && vapiCall.endedAt
            ? Math.round((new Date(vapiCall.endedAt) - new Date(vapiCall.startedAt)) / 1000)
            : 0;
          
          console.log(`  Duration: ${duration} seconds`);
          console.log(`  Ended Reason: ${vapiCall.endedReason}`);
          console.log(`  Transcript: ${vapiCall.transcript ? 'Yes' : 'No'}`);
          console.log(`  Recording: ${vapiCall.recordingUrl ? 'Yes' : 'No'}`);
          console.log(`  Cost: $${vapiCall.cost || 0}`);
          
          // Determine outcome based on VAPI data
          let outcome = 'completed';
          switch (vapiCall.endedReason) {
            case 'customer-ended-call':
              outcome = duration > 30 ? 'answered' : 'quick_hangup';
              break;
            case 'assistant-ended-call':
              outcome = 'completed';
              break;
            case 'silence-timeout':
              outcome = 'no_answer';
              break;
            case 'phone-call-provider-closed-websocket':
            case 'vonage-disconnected':
            case 'vonage-failed-to-connect-call':
              outcome = 'provider_error';
              break;
            default:
              if (duration > 10) {
                outcome = 'answered';
              } else {
                outcome = 'no_answer';
              }
          }
          
          // Create call result object matching webhook format
          const callResult = {
            type: 'call-ended',
            call: vapiCall,
            outcome: outcome,
            transcript: vapiCall.transcript,
            summary: vapiCall.summary,
            analysis: vapiCall.analysis,
            recordingUrl: vapiCall.recordingUrl || vapiCall.stereoRecordingUrl,
            cost: vapiCall.cost,
            costBreakdown: vapiCall.costBreakdown,
            duration: duration
          };
          
          // Process through campaign executor (this handles everything)
          console.log('  📤 Processing through campaign executor...');
          await campaignExecutor.processCallResult(call.vapi_call_id, callResult);
          
          console.log(`  ✅ Processed call with outcome: ${outcome}`);
          
        } else {
          console.log(`  ⏳ Call still in progress: ${vapiCall.status}`);
        }
        
      } catch (error) {
        console.error(`  ❌ Error processing call: ${error.message}`);
      }
      
      // Small delay between calls
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n✅ Finished processing all pending calls');
    
    // Check campaign statistics
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });
    
    if (campaigns && campaigns.length > 0) {
      console.log('\n📊 Campaign Statistics:');
      for (const campaign of campaigns) {
        const { data: stats } = await supabase
          .from('calls')
          .select('status, outcome')
          .eq('campaign_id', campaign.id);
        
        const completed = stats?.filter(c => c.status === 'completed').length || 0;
        const pending = stats?.filter(c => c.status === 'pending').length || 0;
        const answered = stats?.filter(c => c.outcome === 'answered' || c.outcome === 'completed').length || 0;
        
        console.log(`\n${campaign.name}:`);
        console.log(`  Total Calls: ${stats?.length || 0}`);
        console.log(`  Completed: ${completed}`);
        console.log(`  Pending: ${pending}`);
        console.log(`  Answered: ${answered}`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the processor
processVapiCalls();