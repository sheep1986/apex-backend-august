const { createClient } = require('@supabase/supabase-js');
const { config } = require('dotenv');

// Load environment variables
config();

async function fixLeadsTable() {
  console.log('🔧 Fixing leads table schema...');
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing environment variables');
    return;
  }
  
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Add missing columns one by one
    const alterQueries = [
      // Add status column if it doesn't exist
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'new';`,
      
      // Add priority column if it doesn't exist  
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium';`,
      
      // Add source column if it doesn't exist
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS source VARCHAR(100);`,
      
      // Add campaign column if it doesn't exist
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign VARCHAR(255);`,
      
      // Add tags column if it doesn't exist
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';`,
      
      // Add last_contacted column if it doesn't exist
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contacted TIMESTAMP WITH TIME ZONE;`,
      
      // Add next_follow_up column if it doesn't exist
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_follow_up TIMESTAMP WITH TIME ZONE;`,
      
      // Add notes column if it doesn't exist
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT;`,
      
      // Add custom_fields column if it doesn't exist
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';`,
      
      // Add campaign_type column if it doesn't exist
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign_type VARCHAR(10) DEFAULT 'b2b';`,
      
      // Add outcome column if it doesn't exist
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS outcome VARCHAR(50);`,
      
      // Add assigned_to column if it doesn't exist
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(255);`,
      
      // Add next_action column if it doesn't exist
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action TEXT;`,
      
      // Add last_interaction column if it doesn't exist
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_interaction TIMESTAMP WITH TIME ZONE;`,
      
      // Add value column if it doesn't exist
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS value DECIMAL(10,2);`,
      
      // Add interest_level column if it doesn't exist
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS interest_level INTEGER;`,
      
      // Add call_duration column if it doesn't exist
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_duration INTEGER;`,
      
      // Make phone column nullable
      `ALTER TABLE leads ALTER COLUMN phone DROP NOT NULL;`,
      
      // Add constraints for status
      `ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;`,
      `ALTER TABLE leads ADD CONSTRAINT leads_status_check CHECK (status IN ('new', 'contacted', 'interested', 'qualified', 'converted', 'unqualified'));`,
      
      // Add constraints for priority
      `ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_priority_check;`,
      `ALTER TABLE leads ADD CONSTRAINT leads_priority_check CHECK (priority IN ('low', 'medium', 'high'));`,
      
      // Add constraints for campaign_type
      `ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_campaign_type_check;`,
      `ALTER TABLE leads ADD CONSTRAINT leads_campaign_type_check CHECK (campaign_type IN ('b2c', 'b2b'));`,
      
      // Add constraints for outcome
      `ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_outcome_check;`,
      `ALTER TABLE leads ADD CONSTRAINT leads_outcome_check CHECK (outcome IN ('interested', 'not_interested', 'callback', 'voicemail', 'no_answer', 'wrong_number', 'do_not_call'));`
    ];
    
    console.log(`📝 Executing ${alterQueries.length} schema updates...`);
    
    for (let i = 0; i < alterQueries.length; i++) {
      const query = alterQueries[i];
      console.log(`${i + 1}/${alterQueries.length}: ${query.substring(0, 60)}...`);
      
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: query });
        
        if (error) {
          console.error(`❌ Query ${i + 1} failed:`, error.message);
        } else {
          console.log(`✅ Query ${i + 1} succeeded`);
        }
      } catch (err) {
        // If exec_sql doesn't exist, we'll need to do this manually
        console.log(`⚠️  Query ${i + 1}: exec_sql function not available`);
      }
    }
    
    console.log('\n🎉 Schema update completed!');
    console.log('Note: If queries failed due to missing exec_sql function,');
    console.log('please run these SQL commands manually in Supabase SQL Editor:');
    console.log('URL: https://twigokrtbvigiqnaybfy.supabase.co/project/default/sql');
    console.log('\nSQL Commands to run:');
    alterQueries.forEach((query, i) => {
      console.log(`${i + 1}. ${query}`);
    });
    
  } catch (error) {
    console.error('❌ Schema fix failed:', error.message);
  }
}

// Run the fix
fixLeadsTable(); 