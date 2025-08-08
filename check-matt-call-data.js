const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkMattCallData() {
  // Get Matt's call
  const { data: sampleCall, error } = await supabase
    .from('calls')
    .select('*')
    .eq('id', 'fdbfcfa2-7a01-4f7c-b162-95ca182f8f8f')
    .single();
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('=== MATT CALL DATA ===');
  console.log('Call ID:', sampleCall.id);
  console.log('Customer Name:', sampleCall.customer_name);
  console.log('Customer Phone:', sampleCall.customer_phone);
  console.log('\n=== EXTRACTED FIELDS (SHOULD HAVE DATA) ===');
  console.log('customer_email:', sampleCall.customer_email || 'NOT EXTRACTED');
  console.log('address:', sampleCall.address || 'NOT EXTRACTED');
  console.log('contact_info:', sampleCall.contact_info || 'NOT EXTRACTED');
  console.log('summary:', sampleCall.summary || 'NOT EXTRACTED');
  console.log('notes:', sampleCall.notes || 'NOT EXTRACTED');
  console.log('is_qualified_lead:', sampleCall.is_qualified_lead);
  console.log('outcome:', sampleCall.outcome);
  console.log('sentiment:', sampleCall.sentiment);
  console.log('key_points:', sampleCall.key_points);
  console.log('buying_signals:', sampleCall.buying_signals);
  console.log('ai_confidence_score:', sampleCall.ai_confidence_score);
  console.log('qualification_details:', sampleCall.qualification_details);
  
  // Check leads table
  console.log('\n=== CHECKING LEADS TABLE ===');
  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .or(`phone.eq.+35677161714,name.ilike.%Matt%,first_name.ilike.%Matt%`);
    
  if (leads && leads.length > 0) {
    console.log(`Found ${leads.length} lead(s) for Matt:`);
    leads.forEach((lead, idx) => {
      console.log(`\nLead #${idx + 1}:`);
      console.log('  ID:', lead.id);
      console.log('  Name:', lead.first_name, lead.last_name || lead.name);
      console.log('  Phone:', lead.phone);
      console.log('  Email:', lead.email || 'NOT SET');
      console.log('  Address:', lead.address || 'NOT SET');
      console.log('  Notes preview:', lead.notes ? lead.notes.substring(0, 100) + '...' : 'NO NOTES');
    });
  } else {
    console.log('No leads found for Matt');
  }
}

checkMattCallData().catch(console.error);