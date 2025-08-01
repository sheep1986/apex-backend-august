require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTables() {
  console.log('🔍 Checking database tables...');
  
  // Check campaigns table
  try {
    const { data: campaigns, error: campaignsError } = await supabase
      .from('campaigns')
      .select('*')
      .limit(1);
    
    if (campaignsError) {
      console.log('❌ Campaigns table error:', campaignsError);
    } else {
      console.log('✅ Campaigns table columns:', campaigns[0] ? Object.keys(campaigns[0]) : 'No data');
    }
  } catch (error) {
    console.log('❌ Campaigns table error:', error.message);
  }
  
  // Check leads table  
  try {
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('*')
      .limit(1);
      
    if (leadsError) {
      console.log('❌ Leads table error:', leadsError);
    } else {
      console.log('✅ Leads table columns:', leads[0] ? Object.keys(leads[0]) : 'No data');
    }
  } catch (error) {
    console.log('❌ Leads table error:', error.message);
  }
  
  // Check if vapi_assistants table exists
  try {
    const { data: assistants, error: assistantsError } = await supabase
      .from('vapi_assistants')
      .select('*')
      .limit(1);
      
    if (assistantsError) {
      console.log('❌ VAPI Assistants table error:', assistantsError);
    } else {
      console.log('✅ VAPI Assistants table columns:', assistants[0] ? Object.keys(assistants[0]) : 'No data');
    }
  } catch (error) {
    console.log('❌ VAPI Assistants table error:', error.message);
  }
  
  // Check calls table
  try {
    const { data: calls, error: callsError } = await supabase
      .from('calls')
      .select('*')
      .limit(1);
      
    if (callsError) {
      console.log('❌ Calls table error:', callsError);
    } else {
      console.log('✅ Calls table columns:', calls[0] ? Object.keys(calls[0]) : 'No data');
    }
  } catch (error) {
    console.log('❌ Calls table error:', error.message);
  }
}

checkTables().catch(console.error); 