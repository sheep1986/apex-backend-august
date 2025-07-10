const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabaseStructure() {
  try {
    console.log('🔍 Checking current database structure...\n');
    
    // Check if users table exists and get its structure
    console.log('📋 Checking users table...');
    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('*')
      .limit(1);
    
    if (usersError) {
      console.log('❌ Users table error:', usersError.message);
    } else {
      console.log('✅ Users table exists');
      if (usersData && usersData.length > 0) {
        console.log('📊 Users table columns:', Object.keys(usersData[0]));
      }
    }
    
    // Check organizations table
    console.log('\n📋 Checking organizations table...');
    const { data: orgsData, error: orgsError } = await supabase
      .from('organizations')
      .select('*')
      .limit(1);
    
    if (orgsError) {
      console.log('❌ Organizations table error:', orgsError.message);
    } else {
      console.log('✅ Organizations table exists');
      if (orgsData && orgsData.length > 0) {
        console.log('📊 Organizations table columns:', Object.keys(orgsData[0]));
      }
    }
    
    // Check what tables exist
    console.log('\n📋 Checking all available tables...');
    const { data: tablesData, error: tablesError } = await supabase
      .rpc('get_schema_tables');
    
    if (tablesError) {
      console.log('❌ Cannot get tables list:', tablesError.message);
      
      // Try alternative method - check some common tables
      const commonTables = ['users', 'organizations', 'leads', 'campaigns', 'call_logs'];
      
      for (const table of commonTables) {
        try {
          const { data, error } = await supabase.from(table).select('*').limit(0);
          if (!error) {
            console.log(`✅ Table '${table}' exists`);
          }
        } catch (err) {
          console.log(`❌ Table '${table}' does not exist or is not accessible`);
        }
      }
    } else {
      console.log('📊 Available tables:', tablesData);
    }
    
    // Try to get current role constraints
    console.log('\n📋 Checking current role constraints...');
    try {
      const { data: constraintData, error: constraintError } = await supabase
        .rpc('get_table_constraints', { table_name: 'users' });
      
      if (!constraintError && constraintData) {
        console.log('📊 Current constraints:', constraintData);
      }
    } catch (err) {
      console.log('❌ Cannot check constraints:', err.message);
    }
    
    // Try a simple insert to see what the actual error is
    console.log('\n🧪 Testing simple user creation...');
    const testUser = {
      email: 'test-simple@example.com',
      first_name: 'Test',
      last_name: 'Simple'
    };
    
    const { data: insertData, error: insertError } = await supabase
      .from('users')
      .insert(testUser)
      .select();
    
    if (insertError) {
      console.log('❌ Insert error details:', insertError);
    } else {
      console.log('✅ Simple user creation worked:', insertData);
      
      // Clean up
      if (insertData && insertData.length > 0) {
        await supabase.from('users').delete().eq('id', insertData[0].id);
        console.log('🧹 Test user cleaned up');
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking database structure:', error);
  }
}

// Run the check
if (require.main === module) {
  checkDatabaseStructure()
    .then(() => {
      console.log('\n🎉 Database structure check completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Database check failed:', error);
      process.exit(1);
    });
}

module.exports = { checkDatabaseStructure }; 