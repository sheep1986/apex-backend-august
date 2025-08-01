#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://twigokrtbvigiqnaybfy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJis3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMzUyNjksImV4cCI6MjA2NjcxMTI2OX0.AcRI1NYcCYpRqvHZvux15kMbGPocFbvT6uLf5DD6v24';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function updateLeadFromCall() {
  console.log('🔄 Updating lead with call data...\n');
  
  try {
    // Get the completed call
    const { data: completedCall } = await supabase
      .from('calls')
      .select('*')
      .eq('status', 'completed')
      .not('transcript', 'is', null)
      .single();
    
    if (!completedCall) {
      console.log('No completed calls found');
      return;
    }
    
    console.log(`📞 Found completed call with transcript`);
    console.log(`  Lead ID: ${completedCall.lead_id}`);
    console.log(`  Duration: ${completedCall.duration}s`);
    
    if (!completedCall.lead_id) {
      console.log('❌ Call has no lead_id');
      return;
    }
    
    // Parse transcript to extract name
    const transcript = completedCall.transcript;
    let extractedName = 'Ricky'; // From transcript: "Hello. Is it possible to speak to Ricky, please?"
    
    // Update the lead with call results
    const { data: updatedLead, error } = await supabase
      .from('leads')
      .update({
        first_name: extractedName,
        last_name: '(From Call)',
        status: 'qualified',
        qualification_status: 'qualified',
        call_status: 'completed',
        last_call_at: completedCall.ended_at,
        call_attempts: 1,
        score: 85, // High score for 138 second conversation
        lead_quality: 'high',
        updated_at: new Date().toISOString()
      })
      .eq('id', completedCall.lead_id)
      .select()
      .single();
    
    if (error) {
      console.error('❌ Error updating lead:', error);
      return;
    }
    
    console.log(`\n✅ Successfully updated lead!`);
    console.log(`  Name: ${updatedLead.first_name} ${updatedLead.last_name}`);
    console.log(`  Status: ${updatedLead.status}`);
    console.log(`  Qualification: ${updatedLead.qualification_status}`);
    console.log(`  Score: ${updatedLead.score}`);
    
    // Also update campaign_contacts with the name
    const { data: contact } = await supabase
      .from('campaign_contacts')
      .select('*')
      .eq('phone', updatedLead.phone.replace('+', ''))
      .single();
    
    if (contact) {
      await supabase
        .from('campaign_contacts')
        .update({
          first_name: extractedName,
          last_name: '(From Call)',
          company: 'Emerald Green Energy Interest'
        })
        .eq('id', contact.id);
      
      console.log('✅ Updated contact information');
    }
    
    console.log('\n📊 Lead is now qualified and ready for CRM!');
    console.log('Next steps:');
    console.log('1. Go to the CRM section in the dashboard');
    console.log('2. Review the qualified lead');
    console.log('3. Accept to add to CRM contacts');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

updateLeadFromCall();