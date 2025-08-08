import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('🚀 Running lead owner migration...\n');
  
  try {
    // Read the SQL file
    const sql = fs.readFileSync('./add-lead-owner-column.sql', 'utf8');
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', { query: sql });
    
    if (error) {
      // If RPC doesn't exist, try executing statements one by one
      console.log('📝 Executing migration statements...');
      
      const statements = sql.split(';').filter(s => s.trim());
      
      for (const statement of statements) {
        if (statement.trim()) {
          console.log(`\nExecuting: ${statement.trim().substring(0, 50)}...`);
          
          // Since we can't execute raw SQL directly, we'll need to do this differently
          console.log('⚠️  Cannot execute raw SQL through Supabase client.');
          console.log('Please run the following SQL in your Supabase SQL editor:');
          console.log('\n' + statement.trim() + ';\n');
        }
      }
      
      console.log('\n📋 Full migration SQL saved to: add-lead-owner-column.sql');
      console.log('Please execute this in your Supabase dashboard SQL editor.');
    } else {
      console.log('✅ Migration completed successfully!');
    }
    
  } catch (err) {
    console.error('❌ Migration error:', err);
  }
}

runMigration();