#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('🚀 Starting AI Analysis migration...\n');

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'database', 'ai-analysis-schema.sql');
    const sqlContent = await fs.readFile(sqlPath, 'utf8');

    // Split into individual statements (basic split, may need refinement)
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      
      // Skip comments
      if (statement.trim().startsWith('--')) continue;
      
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      
      // Extract a preview of the statement
      const preview = statement.substring(0, 80).replace(/\n/g, ' ');
      console.log(`  ${preview}${statement.length > 80 ? '...' : ''}`);
      
      try {
        const { error } = await supabase.rpc('exec_sql', { 
          sql_query: statement 
        });
        
        if (error) {
          // Try direct execution as fallback
          console.log('  ⚠️  RPC failed, trying direct query...');
          // Note: Supabase client doesn't support direct SQL execution
          // You'll need to use a PostgreSQL client or the Supabase SQL editor
          console.log('  ❌ Skipping - requires direct database access');
          continue;
        }
        
        console.log('  ✅ Success\n');
      } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
      }
    }

    console.log('\n✅ Migration completed!');
    console.log('\n📋 Next steps:');
    console.log('1. Add OPENAI_API_KEY to your environment variables');
    console.log('2. Update the webhook endpoint to use vapi-webhook-enhanced.ts');
    console.log('3. Set up a cron job to process the AI queue (GET /api/vapi/process-queue)');
    console.log('4. Test with a sample call using POST /api/vapi/analyze/:callId');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Alternative: Create tables using Supabase client
async function createTablesViaClient() {
  console.log('🔧 Creating tables via Supabase client...\n');

  try {
    // Note: This is a workaround since Supabase client doesn't support DDL
    // We'll create the tables by inserting and then deleting a dummy record
    
    // Test if tables exist by trying to query them
    const tables = ['appointments', 'tasks', 'ai_processing_queue', 'campaign_leads'];
    
    for (const table of tables) {
      console.log(`Checking table: ${table}`);
      const { error } = await supabase.from(table).select('id').limit(1);
      
      if (error && error.code === '42P01') {
        console.log(`  ❌ Table ${table} does not exist`);
        console.log(`  ℹ️  Please create it using the Supabase SQL editor`);
      } else if (error) {
        console.log(`  ⚠️  Error checking ${table}: ${error.message}`);
      } else {
        console.log(`  ✅ Table ${table} exists`);
      }
    }

    console.log('\n📝 Manual steps required:');
    console.log('1. Go to your Supabase dashboard');
    console.log('2. Navigate to the SQL editor');
    console.log('3. Copy and paste the contents of database/ai-analysis-schema.sql');
    console.log('4. Execute the SQL statements');
    console.log('\nOr run this script with PostgreSQL connection:');
    console.log('psql $DATABASE_URL < database/ai-analysis-schema.sql');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the appropriate migration method
console.log('🤖 AI Analysis Database Migration\n');
console.log('This migration adds:');
console.log('- AI analysis fields to calls table');
console.log('- Appointments table for automated booking');
console.log('- Tasks table for callbacks and follow-ups');
console.log('- AI processing queue for reliable processing');
console.log('- Campaign leads tracking\n');

// Since Supabase client doesn't support DDL, show instructions
createTablesViaClient();

// Export for use in other scripts
module.exports = { runMigration };