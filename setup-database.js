const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function setupDatabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service role for schema changes
  
  console.log('🔗 Setting up database schema...');
  console.log(`URL: ${supabaseUrl}`);
  console.log(`Key: ${supabaseKey ? 'Present' : 'Missing'}`);
  
  if (!supabaseKey) {
    console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY - needed for schema changes');
    return;
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Read the schema file
    const schemaPath = path.join(__dirname, 'database', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('📋 Schema file loaded, executing...');
    
    // Execute the schema
    const { data, error } = await supabase.rpc('exec_sql', { sql: schema });
    
    if (error) {
      console.error('❌ Schema execution error:', error);
      
      // Try alternative approach - execute statements one by one
      console.log('🔄 Trying alternative approach...');
      const statements = schema.split(';').filter(stmt => stmt.trim());
      
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i].trim();
        if (stmt) {
          try {
            await supabase.rpc('exec_sql', { sql: stmt });
            console.log(`✅ Statement ${i + 1} executed`);
          } catch (e) {
            console.log(`⚠️  Statement ${i + 1} failed: ${e.message}`);
          }
        }
      }
    } else {
      console.log('✅ Schema executed successfully');
    }

  } catch (error) {
    console.error('❌ Setup failed:', error);
  }
}

setupDatabase()
  .then(() => {
    console.log('\n🏁 Database setup complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Database setup failed:', error);
    process.exit(1);
  });
