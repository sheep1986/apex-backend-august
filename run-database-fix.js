const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runDatabaseFix() {
  console.log('🔧 Starting comprehensive database fix...');
  
  try {
    // Read the SQL fix file
    const sqlScript = fs.readFileSync('./database/fix-schema-final.sql', 'utf8');
    
    // Split the script into individual statements
    const statements = sqlScript
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📋 Executing ${statements.length} SQL statements...`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          console.log(`⏳ Executing statement ${i + 1}/${statements.length}...`);
          const { error } = await supabase.rpc('exec_sql', { 
            sql_query: statement + ';' 
          });
          
          if (error) {
            console.log(`⚠️ Warning on statement ${i + 1}:`, error.message);
            // Continue with next statement for non-critical errors
          } else {
            console.log(`✅ Statement ${i + 1} completed successfully`);
          }
        } catch (err) {
          console.log(`⚠️ Error on statement ${i + 1}:`, err.message);
          // Continue with next statement
        }
      }
    }
    
    console.log('🎉 Database fix completed!');
    
    // Test the fix by checking user roles
    console.log('🔍 Testing database fix...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, role, organization_id')
      .limit(5);
      
    if (usersError) {
      console.log('❌ Error testing users table:', usersError.message);
    } else {
      console.log('✅ Users table is working:', users.length, 'users found');
      if (users.length > 0) {
        console.log('👤 Sample user:', users[0]);
      }
    }
    
    // Check organizations
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, name, type, slug')
      .limit(5);
      
    if (orgsError) {
      console.log('❌ Error testing organizations table:', orgsError.message);
    } else {
      console.log('✅ Organizations table is working:', orgs.length, 'organizations found');
      if (orgs.length > 0) {
        console.log('🏢 Sample organization:', orgs[0]);
      }
    }
    
  } catch (error) {
    console.error('❌ Database fix failed:', error.message);
    process.exit(1);
  }
}

runDatabaseFix(); 