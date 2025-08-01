require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createVAPITables() {
  try {
    console.log('🚀 Creating VAPI tables...');
    
    // Read the SQL file
    const sqlContent = fs.readFileSync('database/create-vapi-assistants-table.sql', 'utf8');
    
    // Split into individual statements
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    for (const statement of statements) {
      if (statement.includes('CREATE TABLE') || statement.includes('CREATE INDEX') || statement.includes('DO $$')) {
        console.log('Executing:', statement.substring(0, 50) + '...');
        
        const { error } = await supabase.rpc('exec_sql', { sql: statement });
        
        if (error) {
          console.log('❌ Error executing statement:', error);
        } else {
          console.log('✅ Statement executed successfully');
        }
      }
    }
    
    console.log('🎉 VAPI tables creation completed!');
    
  } catch (error) {
    console.error('❌ Error creating VAPI tables:', error);
  }
}

createVAPITables(); 