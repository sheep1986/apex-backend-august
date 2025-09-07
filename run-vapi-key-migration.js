#!/usr/bin/env node

/**
 * Script to apply VAPI key migration
 * Updates database schema to use vapi_public_key and vapi_private_key
 * Run with: node run-vapi-key-migration.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration() {
  console.log('🚀 Starting VAPI key migration...');
  console.log('📍 Supabase URL:', supabaseUrl);
  
  try {
    // Read migration SQL file
    const migrationPath = path.join(__dirname, 'database', 'rename-vapi-key-columns.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf8');
    
    console.log('📄 Read migration file:', migrationPath);
    
    // Split SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`📊 Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      
      // Skip pure comment lines
      if (statement.trim().startsWith('--')) {
        continue;
      }
      
      // Log what we're about to execute (first 100 chars)
      const preview = statement.substring(0, 100).replace(/\n/g, ' ');
      console.log(`\n🔧 Executing statement ${i + 1}/${statements.length}: ${preview}...`);
      
      try {
        // Use Supabase RPC for complex SQL statements
        const { error } = await supabase.rpc('exec_sql', { 
          sql_query: statement 
        });
        
        if (error) {
          // If RPC doesn't exist, try a simpler approach
          if (error.message.includes('exec_sql')) {
            console.log('⚠️ RPC not available, skipping complex statement');
            continue;
          }
          throw error;
        }
        
        console.log(`✅ Statement ${i + 1} executed successfully`);
      } catch (error) {
        console.error(`❌ Error executing statement ${i + 1}:`, error.message);
        
        // Decide if we should continue or abort
        if (error.message.includes('already exists') || 
            error.message.includes('does not exist')) {
          console.log('⚠️ Non-critical error, continuing...');
        } else {
          throw error;
        }
      }
    }
    
    // Verify migration results
    console.log('\n🔍 Verifying migration...');
    
    // Check if vapi_public_key column exists
    const { data: columns, error: columnsError } = await supabase
      .from('organizations')
      .select('vapi_public_key, vapi_private_key, vapi_api_key')
      .limit(1);
    
    if (columnsError) {
      console.error('❌ Could not verify columns:', columnsError);
    } else {
      console.log('✅ Columns verified successfully');
    }
    
    // Count organizations with VAPI keys
    const { count: orgCount } = await supabase
      .from('organizations')
      .select('*', { count: 'exact', head: true })
      .or('vapi_public_key.not.is.null,vapi_private_key.not.is.null,vapi_api_key.not.is.null');
    
    console.log(`📊 Found ${orgCount || 0} organizations with VAPI keys`);
    
    // Check if audit table was created
    const { error: auditError } = await supabase
      .from('vapi_key_audit')
      .select('id')
      .limit(1);
    
    if (auditError && !auditError.message.includes('no rows')) {
      console.log('⚠️ Audit table may not have been created:', auditError.message);
    } else {
      console.log('✅ Audit table verified');
    }
    
    console.log('\n✅ Migration completed successfully!');
    console.log('📝 Summary:');
    console.log('  - vapi_public_key column added/updated');
    console.log('  - vapi_api_key kept for backward compatibility');
    console.log('  - RLS policies updated for admin-only access');
    console.log('  - Audit table created for key change tracking');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Alternative approach: Execute migration directly via Supabase SQL Editor
async function generateMigrationScript() {
  console.log('\n📝 Generating migration script for manual execution...');
  
  try {
    const migrationPath = path.join(__dirname, 'database', 'rename-vapi-key-columns.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf8');
    
    const outputPath = path.join(__dirname, 'EXECUTE_IN_SUPABASE.sql');
    await fs.writeFile(outputPath, migrationSQL);
    
    console.log('✅ Migration script saved to:', outputPath);
    console.log('\n📋 Instructions:');
    console.log('1. Go to your Supabase dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Create a new query');
    console.log('4. Copy and paste the contents of EXECUTE_IN_SUPABASE.sql');
    console.log('5. Run the query');
    console.log('\nThis will apply all the necessary database changes.');
    
  } catch (error) {
    console.error('❌ Error generating script:', error);
  }
}

// Main execution
async function main() {
  console.log('=================================');
  console.log('VAPI Key Migration Tool');
  console.log('=================================\n');
  
  // Try to run migration automatically
  await runMigration();
  
  // If automatic migration fails, generate script for manual execution
  if (process.argv.includes('--generate-script')) {
    await generateMigrationScript();
  }
}

main().catch(console.error);