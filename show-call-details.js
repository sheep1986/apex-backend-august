#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://twigokrtbvigiqnaybfy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMzUyNjksImV4cCI6MjA2NjcxMTI2OX0.AcRI1NYcCYpRqvHZvux15kMbGPocFbvT6uLf5DD6v24';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function showCallDetails() {
  console.log('📞 Call Details\n');
  console.log('='.repeat(80) + '\n');
  
  try {
    // Get the completed call
    const { data: completedCall } = await supabase
      .from('calls')
      .select('*')
      .eq('status', 'completed')
      .not('vapi_call_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (!completedCall) {
      console.log('No completed calls found');
      return;
    }
    
    // Basic Info
    console.log('📋 BASIC INFORMATION');
    console.log('─'.repeat(40));
    console.log(`Call ID: ${completedCall.id}`);
    console.log(`VAPI Call ID: ${completedCall.vapi_call_id}`);
    console.log(`Status: ${completedCall.status}`);
    console.log(`Phone Number: ${completedCall.to_number}`);
    console.log(`Direction: ${completedCall.direction}`);
    console.log(`Duration: ${completedCall.duration} seconds (${Math.floor(completedCall.duration / 60)}m ${completedCall.duration % 60}s)`);
    console.log(`Cost: $${completedCall.cost || 0}`);
    
    // Timing
    console.log('\n⏰ TIMING');
    console.log('─'.repeat(40));
    console.log(`Started: ${new Date(completedCall.started_at).toLocaleString()}`);
    console.log(`Ended: ${new Date(completedCall.ended_at).toLocaleString()}`);
    
    // Recording
    console.log('\n🎙️ RECORDING');
    console.log('─'.repeat(40));
    if (completedCall.recording_url) {
      console.log(`Recording URL: ${completedCall.recording_url}`);
      console.log('(You can open this URL in your browser to listen to the call)');
    } else {
      console.log('No recording available');
    }
    
    // Summary
    console.log('\n📝 AI SUMMARY');
    console.log('─'.repeat(40));
    if (completedCall.summary) {
      console.log(completedCall.summary);
    } else {
      console.log('No summary available');
    }
    
    // Transcript
    console.log('\n💬 TRANSCRIPT');
    console.log('─'.repeat(40));
    if (completedCall.transcript) {
      // Format transcript for better readability
      const transcript = completedCall.transcript;
      const lines = transcript.split('\n');
      lines.forEach(line => {
        if (line.startsWith('User:') || line.startsWith('AI:')) {
          console.log('\n' + line);
        } else {
          console.log(line);
        }
      });
    } else {
      console.log('No transcript available');
    }
    
    // Lead Info
    console.log('\n\n👤 LEAD INFORMATION');
    console.log('─'.repeat(40));
    if (completedCall.lead_id) {
      const { data: lead } = await supabase
        .from('leads')
        .select('*')
        .eq('id', completedCall.lead_id)
        .single();
      
      if (lead) {
        console.log(`Lead Name: ${lead.first_name} ${lead.last_name}`);
        console.log(`Status: ${lead.status}`);
        console.log(`Qualification: ${lead.qualification_status}`);
        console.log(`Score: ${lead.score}`);
        console.log(`Lead Quality: ${lead.lead_quality}`);
      }
    } else {
      console.log('No lead associated with this call');
    }
    
    // Campaign Info
    console.log('\n\n📊 CAMPAIGN INFORMATION');
    console.log('─'.repeat(40));
    if (completedCall.campaign_id) {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', completedCall.campaign_id)
        .single();
      
      if (campaign) {
        console.log(`Campaign: ${campaign.name}`);
        console.log(`Status: ${campaign.status}`);
      }
    }
    
    console.log('\n' + '='.repeat(80));
    
  } catch (error) {
    console.error('Error:', error);
  }
}

showCallDetails();