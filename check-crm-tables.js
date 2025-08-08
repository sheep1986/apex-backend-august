require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTables() {
  try {
    console.log('🔍 Checking available CRM tables...');
    
    const { data: leads, error: leadsError } = await supabase.from('leads').select('*').limit(1);
    const { data: contacts, error: contactsError } = await supabase.from('contacts').select('*').limit(1);
    const { data: crm_leads, error: crmError } = await supabase.from('crm_leads').select('*').limit(1);
    
    console.log('\nAvailable CRM tables:');
    if (!leadsError) console.log('✅ leads table exists');
    if (!contactsError) console.log('✅ contacts table exists'); 
    if (!crmError) console.log('✅ crm_leads table exists');
    
    if (leadsError) console.log('❌ leads:', leadsError.message);
    if (contactsError) console.log('❌ contacts:', contactsError.message);
    if (crmError) console.log('❌ crm_leads:', crmError.message);
    
    // If leads table exists, show its structure
    if (!leadsError) {
      console.log('\n📋 Leads table structure check...');
      const { data: sample } = await supabase.from('leads').select('*').limit(1);
      if (sample && sample.length > 0) {
        console.log('Sample lead fields:', Object.keys(sample[0]));
      }
    }
  } catch (e) {
    console.log('❌ Error checking tables:', e.message);
  }
}

checkTables();