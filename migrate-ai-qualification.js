const supabase = require('./services/supabase-client').default;

async function runMigration() {
  console.log('🔄 Running AI Lead Qualification migration...');
  
  try {
    // Add columns to calls table
    const alterQueries = [
      'ALTER TABLE calls ADD COLUMN IF NOT EXISTS ai_confidence_score DECIMAL(3,2) DEFAULT NULL',
      'ALTER TABLE calls ADD COLUMN IF NOT EXISTS ai_recommendation VARCHAR(20) DEFAULT NULL', 
      'ALTER TABLE calls ADD COLUMN IF NOT EXISTS qualification_status VARCHAR(30) DEFAULT \'pending\'',
      'ALTER TABLE calls ADD COLUMN IF NOT EXISTS created_crm_contact BOOLEAN DEFAULT FALSE'
    ];
    
    for (const query of alterQueries) {
      console.log('Executing:', query);
      const { error } = await supabase.rpc('exec_sql', { sql_query: query });
      if (error && !error.message.includes('already exists')) {
        console.error('❌ Error:', error);
      } else {
        console.log('✅ Success');
      }
    }
    
    // Update existing calls to pending
    console.log('Updating existing calls...');
    const { error: updateError } = await supabase
      .from('calls')
      .update({ qualification_status: 'pending' })
      .is('qualification_status', null);
      
    if (updateError) {
      console.error('❌ Update error:', updateError);
    } else {
      console.log('✅ Updated existing calls');
    }
    
    console.log('✅ Migration completed!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

runMigration();