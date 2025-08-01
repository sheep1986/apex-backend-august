const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function addColumns() {
  console.log('🔧 Adding AI columns to calls table...');
  
  // Add columns one by one
  const columns = [
    { name: 'is_qualified_lead', type: 'BOOLEAN DEFAULT false' },
    { name: 'contact_info', type: 'JSONB' },
    { name: 'crm_status', type: 'TEXT' }
  ];
  
  for (const column of columns) {
    try {
      // Check if column exists first
      const { data: existingCall, error: checkError } = await supabase
        .from('calls')
        .select(column.name)
        .limit(1);
      
      if (checkError && checkError.message.includes('does not exist')) {
        console.log(`Adding column: ${column.name}`);
        
        // For now, just log the SQL - you'll need to run these manually in Supabase dashboard
        console.log(`ALTER TABLE calls ADD COLUMN ${column.name} ${column.type};`);
      } else {
        console.log(`Column ${column.name} already exists`);
      }
    } catch (error) {
      console.error(`Error checking column ${column.name}:`, error);
    }
  }
  
  console.log('\n📝 SQL to run in Supabase SQL Editor:');
  console.log(`
-- Add AI processing columns to calls table
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS is_qualified_lead BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS contact_info JSONB,
ADD COLUMN IF NOT EXISTS crm_status TEXT;

-- Add index for faster qualified lead queries
CREATE INDEX IF NOT EXISTS idx_calls_qualified_leads 
ON calls(organization_id, is_qualified_lead) 
WHERE is_qualified_lead = true;
  `);
}

addColumns();