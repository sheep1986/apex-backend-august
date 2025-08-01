const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL || 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyMDE4MTA3MCwiZXhwIjoyMDM1NzU3MDcwfQ.Y4DQK8yc8KcjNYGNAhA-Vo5P0MqGGcJPINwRNYr2PUs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function addColumns() {
  try {
    console.log('🔄 Adding AI qualification columns to calls table...');
    
    // Add columns one by one
    const alterCommands = [
      'ALTER TABLE calls ADD COLUMN IF NOT EXISTS ai_confidence_score DECIMAL(3,2) DEFAULT NULL',
      'ALTER TABLE calls ADD COLUMN IF NOT EXISTS ai_recommendation VARCHAR(20) DEFAULT NULL', 
      'ALTER TABLE calls ADD COLUMN IF NOT EXISTS qualification_status VARCHAR(30) DEFAULT \'pending\'',
      'ALTER TABLE calls ADD COLUMN IF NOT EXISTS created_crm_contact BOOLEAN DEFAULT FALSE',
      'ALTER TABLE calls ADD COLUMN IF NOT EXISTS qualification_reviewed_at TIMESTAMP DEFAULT NULL',
      'ALTER TABLE calls ADD COLUMN IF NOT EXISTS qualification_reviewed_by UUID DEFAULT NULL'
    ];
    
    for (const cmd of alterCommands) {
      const { error } = await supabase.rpc('exec_sql', { sql_query: cmd });
      if (error) {
        console.log('⚠️ Command might have failed (could be normal if column exists):', error.message);
      } else {
        console.log('✅ Executed:', cmd.substring(0, 60) + '...');
      }
    }
    
    // Create indexes
    const indexCommands = [
      'CREATE INDEX IF NOT EXISTS idx_calls_qualification_status ON calls (qualification_status)',
      'CREATE INDEX IF NOT EXISTS idx_calls_ai_confidence ON calls (ai_confidence_score)', 
      'CREATE INDEX IF NOT EXISTS idx_calls_org_qualification ON calls (organization_id, qualification_status)'
    ];
    
    for (const cmd of indexCommands) {
      const { error } = await supabase.rpc('exec_sql', { sql_query: cmd });
      if (error) {
        console.log('⚠️ Index command result:', error.message);
      } else {
        console.log('✅ Created index:', cmd.substring(0, 60) + '...');
      }
    }
    
    // Update existing calls
    const updateCmd = 'UPDATE calls SET qualification_status = \'pending\' WHERE qualification_status IS NULL';
    const { error: updateError } = await supabase.rpc('exec_sql', { sql_query: updateCmd });
    if (updateError) {
      console.log('⚠️ Update command result:', updateError.message);
    } else {
      console.log('✅ Updated existing calls to pending status');
    }
    
    console.log('✅ Migration completed!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

addColumns();