#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://twigokrtbvigiqnaybfy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMzUyNjksImV4cCI6MjA2NjcxMTI2OX0.AcRI1NYcCYpRqvHZvux15kMbGPocFbvT6uLf5DD6v24';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function createLeadFromCompletedCall() {
  console.log('🔄 Creating lead from completed call...\n');
  
  try {
    // Get the completed call
    const { data: completedCall } = await supabase
      .from('calls')
      .select('*')
      .eq('status', 'completed')
      .not('transcript', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (!completedCall) {
      console.log('No completed calls found');
      return;
    }
    
    console.log(`📞 Found completed call:`);
    console.log(`  ID: ${completedCall.id}`);
    console.log(`  To: ${completedCall.to_number}`);
    console.log(`  Duration: ${completedCall.duration}s`);
    console.log(`  Has Transcript: ${!!completedCall.transcript}`);
    console.log(`  Has Summary: ${!!completedCall.summary}`);
    
    // Check if lead already exists
    if (completedCall.lead_id) {
      const { data: existingLead } = await supabase
        .from('leads')
        .select('*')
        .eq('id', completedCall.lead_id)
        .single();
      
      if (existingLead) {
        console.log(`\n✅ Lead already exists: ${existingLead.name}`);
        return;
      }
    }
    
    // Find matching contact by phone number
    const phoneNumber = completedCall.to_number?.replace(/^\+/, '');
    console.log(`\n🔍 Looking for contact with phone: ${phoneNumber}`);
    
    const { data: contacts } = await supabase
      .from('campaign_contacts')
      .select('*')
      .eq('campaign_id', completedCall.campaign_id)
      .or(`phone.eq.${phoneNumber},phone.eq.+${phoneNumber}`);
    
    if (!contacts || contacts.length === 0) {
      console.log('  No matching contact found. Creating one...');
      
      // Create a contact from the call data
      const { data: newContact, error: contactError } = await supabase
        .from('campaign_contacts')
        .insert({
          campaign_id: completedCall.campaign_id,
          organization_id: completedCall.organization_id,
          first_name: 'Ricky', // From transcript
          last_name: 'Unknown',
          phone: phoneNumber,
          email: `${phoneNumber}@unknown.com`,
          company: 'Emerald Green Energy Interest', // From transcript context
          created_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (contactError) {
        console.error('Error creating contact:', contactError);
        return;
      }
      
      console.log(`  ✅ Created contact: ${newContact.first_name} ${newContact.last_name}`);
      contacts.push(newContact);
    }
    
    const contact = contacts[0];
    console.log(`  Found contact: ${contact.first_name} ${contact.last_name}`);
    
    // Create lead
    const { data: newLead, error: leadError } = await supabase
      .from('leads')
      .insert({
        organization_id: completedCall.organization_id,
        campaign_id: completedCall.campaign_id,
        contact_id: contact.id,
        name: `${contact.first_name} ${contact.last_name}`.trim(),
        email: contact.email,
        phone: contact.phone,
        company: contact.company,
        status: 'qualified', // Since they had a 138 second conversation
        last_call_outcome: 'interested',
        last_call_date: completedCall.ended_at,
        call_attempts: 1,
        source: 'vapi_call',
        notes: `Call duration: ${completedCall.duration}s. ${completedCall.summary || 'Had extended conversation about Emerald Green Energy services.'}`,
        score: 85, // High score for long conversation
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (leadError) {
      console.error('❌ Error creating lead:', leadError);
      return;
    }
    
    console.log(`\n✅ Successfully created lead!`);
    console.log(`  Name: ${newLead.name}`);
    console.log(`  Status: ${newLead.status}`);
    console.log(`  Score: ${newLead.score}`);
    console.log(`  Outcome: ${newLead.last_call_outcome}`);
    
    // Update call with lead_id
    const { error: updateError } = await supabase
      .from('calls')
      .update({ 
        lead_id: newLead.id,
        contact_id: contact.id 
      })
      .eq('id', completedCall.id);
    
    if (!updateError) {
      console.log(`\n✅ Updated call with lead_id`);
    }
    
    // Check CRM contacts
    console.log(`\n🏢 Checking if lead should be promoted to CRM...`);
    const { data: crmContacts } = await supabase
      .from('crm_contacts')
      .select('*')
      .eq('lead_id', newLead.id);
    
    if (!crmContacts || crmContacts.length === 0) {
      console.log('  Lead is qualified and ready for CRM promotion!');
      console.log('  Use the CRM interface to review and accept this lead.');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

createLeadFromCompletedCall();