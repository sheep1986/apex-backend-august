const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDatabase() {
  console.log('🔍 Checking database structure...');
  
  try {
    // Check what tables exist
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');
      
    if (tablesError) {
      console.log('❌ Could not fetch tables:', tablesError.message);
      return;
    }
    
    console.log('📋 Existing tables:');
    tables.forEach(table => console.log(`  - ${table.table_name}`));
    
    // Check users table structure
    const { data: userColumns, error: userError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_schema', 'public')
      .eq('table_name', 'users');
      
    if (userError) {
      console.log('❌ Could not fetch user columns:', userError.message);
    } else {
      console.log('\n👤 Users table columns:');
      userColumns.forEach(col => console.log(`  - ${col.column_name}: ${col.data_type}`));
    }
    
    // Check if organizations table exists
    const { data: orgColumns, error: orgError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_schema', 'public')
      .eq('table_name', 'organizations');
      
    if (orgError) {
      console.log('\n🏢 Organizations table: Does not exist');
    } else {
      console.log('\n🏢 Organizations table columns:');
      orgColumns.forEach(col => console.log(`  - ${col.column_name}: ${col.data_type}`));
    }
    
    // Check user_role enum values
    const { data: enumValues, error: enumError } = await supabase
      .from('information_schema.enum_range')
      .select('*')
      .eq('enum_type', 'user_role');
      
    if (enumError) {
      console.log('\n📝 User role enum: Could not fetch values');
    } else {
      console.log('\n📝 User role enum values:');
      enumValues.forEach(val => console.log(`  - ${val}`));
    }
    
  } catch (error) {
    console.error('❌ Database check failed:', error.message);
  }
}

checkDatabase(); 