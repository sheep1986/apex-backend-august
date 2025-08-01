const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL || 'https://fykmebsjplhmnqerrqrp.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5a21lYnNqcGxobW5xZXJycXJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjAzNTI3NTgsImV4cCI6MjAzNTkyODc1OH0.0WYlV8_OWHEfQP2hTEKGWC1iTIdJEqZbwQZ6I5U4exo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyVapiMigration() {
  try {
    console.log('🔧 Applying VAPI migration to add missing columns...');
    
    // Read the VAPI columns migration file
    const migrationPath = path.join(__dirname, '../database/add-vapi-columns.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Migration SQL:', migrationSQL);
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });
    
    if (error) {
      console.error('❌ Migration failed:', error);
      return false;
    }
    
    console.log('✅ Migration completed successfully:', data);
    
    // Verify the columns were added
    console.log('🔍 Verifying columns were added...');
    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_name', 'organizations')
      .like('column_name', 'vapi_%');
    
    if (columnsError) {
      console.error('❌ Failed to verify columns:', columnsError);
    } else {
      console.log('✅ VAPI columns found:', columns);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error applying migration:', error);
    return false;
  }
}

// Run if called directly
if (require.main === module) {
  applyVapiMigration().then(success => {
    if (success) {
      console.log('🎉 VAPI migration completed successfully!');
      process.exit(0);
    } else {
      console.log('💥 VAPI migration failed!');
      process.exit(1);
    }
  });
}

module.exports = { applyVapiMigration };