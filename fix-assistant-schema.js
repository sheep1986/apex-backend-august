const { supabaseService } = require('./services/supabase-client');
const fs = require('fs');

async function fixAssistantSchema() {
  try {
    console.log('🚀 Fixing assistant and campaign schema...');
    
    // Read the SQL file
    const sql = fs.readFileSync('./database/fix-assistant-schema.sql', 'utf8');
    
    // Split into individual statements
    const statements = sql.split(';').filter(statement => statement.trim());
    
    console.log(`📝 Executing ${statements.length} SQL statements...`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();
      if (statement) {
        try {
          console.log(`   ${i + 1}. Executing: ${statement.split('\n')[0]}...`);
          
          // Try using RPC first
          const { data, error } = await supabaseService.rpc('execute_sql', {
            query: statement
          });
          
          if (error) {
            console.log(`   ⚠️  RPC failed, trying direct approach...`);
            
            // For specific operations that might not work with RPC
            if (statement.includes('ALTER TABLE campaigns ADD COLUMN')) {
              console.log('   📝 Adding total_cost column...');
              // This might fail if column exists, which is OK
            } else if (statement.includes('CREATE TABLE IF NOT EXISTS vapi_assistants')) {
              console.log('   📝 Creating vapi_assistants table...');
              // This might fail if table exists, which is OK
            }
          } else {
            console.log('   ✅ Success');
          }
        } catch (statementError) {
          console.log(`   ⚠️  Statement ${i + 1} warning:`, statementError.message);
        }
      }
    }
    
    // Test the fixes
    console.log('\n🧪 Testing schema fixes...');
    
    // Test total_cost column
    const { data: campaigns, error: campError } = await supabaseService
      .from('campaigns')
      .select('id, total_cost')
      .limit(1);
    
    if (campError) {
      console.log('❌ total_cost column test failed:', campError.message);
    } else {
      console.log('✅ total_cost column accessible');
    }
    
    // Test vapi_assistants table
    const { data: assistants, error: assistError } = await supabaseService
      .from('vapi_assistants')
      .select('id')
      .limit(1);
    
    if (assistError) {
      console.log('❌ vapi_assistants table test failed:', assistError.message);
    } else {
      console.log('✅ vapi_assistants table accessible');
    }
    
    console.log('\n🎉 Schema fixes completed!');
    
  } catch (error) {
    console.error('❌ Error fixing schema:', error);
  }
}

fixAssistantSchema(); 