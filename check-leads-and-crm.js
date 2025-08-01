#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://twigokrtbvigiqnaybfy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMzUyNjksImV4cCI6MjA2NjcxMTI2OX0.AcRI1NYcCYpRqvHZvux15kMbGPocFbvT6uLf5DD6v24';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkLeadsAndCRM() {
  console.log('🔍 Checking leads and CRM status...\n');
  
  try {
    // Get all leads
    const { data: leads } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false });
    
    console.log(`📋 Total leads: ${leads?.length || 0}`);
    
    if (leads && leads.length > 0) {
      console.log('\nRecent leads:');
      leads.slice(0, 5).forEach((lead, idx) => {
        console.log(`\n${idx + 1}. ${lead.name || 'Unknown'}`);
        console.log(`   ID: ${lead.id}`);
        console.log(`   Phone: ${lead.phone}`);
        console.log(`   Status: ${lead.status}`);
        console.log(`   Last Call Outcome: ${lead.last_call_outcome}`);
        console.log(`   Score: ${lead.score || 'N/A'}`);
        console.log(`   Created: ${lead.created_at}`);
      });
    }
    
    // Get CRM contacts
    const { data: crmContacts } = await supabase
      .from('crm_contacts')
      .select('*')
      .order('created_at', { ascending: false });
    
    console.log(`\n🏢 Total CRM contacts: ${crmContacts?.length || 0}`);
    
    if (crmContacts && crmContacts.length > 0) {
      console.log('\nRecent CRM contacts:');
      crmContacts.slice(0, 5).forEach((contact, idx) => {
        console.log(`\n${idx + 1}. ${contact.name}`);
        console.log(`   ID: ${contact.id}`);
        console.log(`   Phone: ${contact.phone}`);
        console.log(`   Status: ${contact.status}`);
        console.log(`   Lead ID: ${contact.lead_id}`);
        console.log(`   Created: ${contact.created_at}`);
      });
    }
    
    // Check for qualified leads not in CRM
    const qualifiedLeads = leads?.filter(l => 
      l.status === 'qualified' || 
      l.last_call_outcome === 'interested'
    ) || [];
    
    const crmLeadIds = crmContacts?.map(c => c.lead_id) || [];
    const leadsNotInCRM = qualifiedLeads.filter(l => !crmLeadIds.includes(l.id));
    
    console.log(`\n📊 Summary:`);
    console.log(`  Qualified leads: ${qualifiedLeads.length}`);
    console.log(`  Leads in CRM: ${crmLeadIds.length}`);
    console.log(`  Qualified leads NOT in CRM: ${leadsNotInCRM.length}`);
    
    if (leadsNotInCRM.length > 0) {
      console.log('\n⚠️ Qualified leads ready for CRM promotion:');
      leadsNotInCRM.forEach(lead => {
        console.log(`  - ${lead.name} (${lead.phone})`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkLeadsAndCRM();