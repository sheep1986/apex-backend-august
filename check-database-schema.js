const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkDatabaseSchema() {
  console.log('🔍 Checking database schema...');
  
  try {
    // Check organizations table columns
    console.log('\n📊 Organizations table columns:');
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .limit(1);
    
    if (orgError) {
      console.error('❌ Error fetching organizations:', orgError);
    } else if (orgData && orgData.length > 0) {
      console.log('✅ Organizations columns:', Object.keys(orgData[0]).join(', '));
    } else {
      console.log('⚠️ No organizations found, checking table structure...');
    }
    
    // Check campaigns table columns
    console.log('\n📊 Campaigns table columns:');
    const { data: campaignData, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .limit(1);
    
    if (campaignError) {
      console.error('❌ Error fetching campaigns:', campaignError);
    } else if (campaignData && campaignData.length > 0) {
      console.log('✅ Campaigns columns:', Object.keys(campaignData[0]).join(', '));
    } else {
      console.log('⚠️ No campaigns found, checking table structure...');
    }
    
    // Check leads table columns
    console.log('\n📊 Leads table columns:');
    const { data: leadData, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .limit(1);
    
    if (leadError) {
      console.error('❌ Error fetching leads:', leadError);
    } else if (leadData && leadData.length > 0) {
      console.log('✅ Leads columns:', Object.keys(leadData[0]).join(', '));
    } else {
      console.log('⚠️ No leads found, checking table structure...');
    }

    // Try to get table structure directly
    console.log('\n🔍 Checking table structure via information_schema...');
    
    const { data: tableStructure, error: structureError } = await supabase
      .rpc('get_table_structure', { table_names: ['organizations', 'campaigns', 'leads'] })
      .then(result => result)
      .catch(error => ({ error }));
    
    if (structureError) {
      console.log('⚠️ Could not get table structure via RPC, trying direct query...');
      
      // Try direct query to information_schema
      const { data: columns, error: columnError } = await supabase
        .from('information_schema.columns')
        .select('table_name, column_name, data_type')
        .in('table_name', ['organizations', 'campaigns', 'leads'])
        .order('table_name, ordinal_position');
      
      if (columnError) {
        console.error('❌ Error fetching table structure:', columnError);
      } else {
        console.log('✅ Table structure:', columns);
      }
    } else {
      console.log('✅ Table structure:', tableStructure);
    }
    
  } catch (error) {
    console.error('❌ Error checking database schema:', error);
  }
}

checkDatabaseSchema().then(() => {
  console.log('\n✅ Database schema check complete');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
}); 