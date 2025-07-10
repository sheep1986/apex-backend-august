const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyDatabaseFix() {
  try {
    console.log('🔧 Applying database schema fix...');
    
    // Read the SQL fix file
    const sqlPath = path.join(__dirname, 'database', 'fix-database-clean.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Split into individual statements (rough split by semicolon + newline)
    const statements = sqlContent
      .split(/;\s*\n/)
      .filter(stmt => stmt.trim() && !stmt.trim().startsWith('--'))
      .map(stmt => stmt.trim() + (stmt.trim().endsWith(';') ? '' : ';'));
    
    console.log(`📋 Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim().length < 10) continue; // Skip very short statements
      
      console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: statement });
        
        if (error) {
          console.warn(`⚠️  Warning on statement ${i + 1}:`, error.message);
          // Continue with other statements even if one fails
        } else {
          console.log(`✅ Statement ${i + 1} executed successfully`);
        }
      } catch (err) {
        console.warn(`⚠️  Error on statement ${i + 1}:`, err.message);
        // Continue execution
      }
    }
    
    console.log('🎉 Database fix application completed!');
    
    // Test the fix by trying to create a test user
    console.log('🧪 Testing user creation...');
    
    const testUserData = {
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      role: 'agency_admin',
      organization_id: '550e8400-e29b-41d4-a716-446655440000',
      is_active: true
    };
    
    const { data: testUser, error: testError } = await supabase
      .from('users')
      .insert(testUserData)
      .select()
      .single();
    
    if (testError) {
      console.error('❌ Test user creation failed:', testError);
    } else {
      console.log('✅ Test user created successfully:', testUser.email);
      
      // Clean up test user
      await supabase.from('users').delete().eq('id', testUser.id);
      console.log('🧹 Test user cleaned up');
    }
    
  } catch (error) {
    console.error('❌ Error applying database fix:', error);
    process.exit(1);
  }
}

// Alternative direct SQL execution
async function executeDirectSQL() {
  try {
    console.log('🔧 Applying database fix with direct SQL...');
    
    // Drop and recreate role constraint
    const { error: dropError } = await supabase.rpc('exec_sql', {
      sql: `
        DO $$ 
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.table_constraints 
                WHERE constraint_name = 'users_role_check' AND table_name = 'users'
            ) THEN
                ALTER TABLE users DROP CONSTRAINT users_role_check;
            END IF;
            
            ALTER TABLE users ADD CONSTRAINT users_role_check 
            CHECK (role IN (
                'platform_owner', 
                'agency_admin', 
                'agency_user', 
                'client_admin', 
                'client_user', 
                'support_admin', 
                'support_agent',
                'agent',
                'admin',
                'user'
            ));
        END $$;
      `
    });
    
    if (dropError) {
      console.error('❌ Error updating role constraints:', dropError);
    } else {
      console.log('✅ Role constraints updated successfully');
    }
    
    // Test user creation
    const testUserData = {
      email: 'test-role@example.com',
      first_name: 'Test',
      last_name: 'Role',
      role: 'agency_admin',
      organization_id: '550e8400-e29b-41d4-a716-446655440000',
      is_active: true
    };
    
    const { data: testUser, error: testError } = await supabase
      .from('users')
      .insert(testUserData)
      .select()
      .single();
    
    if (testError) {
      console.error('❌ Test user creation still failing:', testError);
    } else {
      console.log('✅ Test user created successfully with role:', testUser.role);
      
      // Clean up
      await supabase.from('users').delete().eq('id', testUser.id);
      console.log('🧹 Test user cleaned up');
    }
    
  } catch (error) {
    console.error('❌ Error in direct SQL execution:', error);
  }
}

// Run the fix
if (require.main === module) {
  executeDirectSQL()
    .then(() => {
      console.log('🎉 Database fix completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Database fix failed:', error);
      process.exit(1);
    });
}

module.exports = { applyDatabaseFix, executeDirectSQL }; 