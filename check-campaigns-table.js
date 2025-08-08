const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.log('❌ No Supabase key found in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCampaigns() {
  console.log('🔍 Checking vapi_outbound_campaigns table...');
  
  // First check if table exists
  const { data: tables, error: tableError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .like('table_name', '%campaign%');
    
  console.log('📊 Campaign-related tables:', tables?.map(t => t.table_name) || []);
  
  if (tables && tables.some(t => t.table_name === 'vapi_outbound_campaigns')) {
    const { data, error } = await supabase
      .from('vapi_outbound_campaigns')
      .select('*')
      .limit(3);
      
    if (error) {
      console.log('❌ Query error:', error.message);
    } else {
      console.log('✅ Found', data.length, 'campaigns');
      if (data.length > 0) {
        console.log('📋 Sample campaign:', data[0]);
      }
    }
  } else {
    console.log('❌ vapi_outbound_campaigns table does not exist');
  }
  
  // Check organization for your email
  const { data: orgs } = await supabase
    .from('organizations')
    .select('*')
    .limit(3);
    
  console.log('🏢 Organizations found:', orgs?.length || 0);
  if (orgs && orgs.length > 0) {
    console.log('📋 Sample org:', orgs[0]);
  }
}

checkCampaigns().then(() => process.exit(0));