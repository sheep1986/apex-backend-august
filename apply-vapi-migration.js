const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyVapiMigration() {
  console.log('🔧 Adding VAPI columns to organizations table...');
  
  try {
    // Add VAPI columns one by one to avoid syntax issues
    const columns = [
      "ADD COLUMN IF NOT EXISTS vapi_api_key TEXT",
      "ADD COLUMN IF NOT EXISTS vapi_assistant_id TEXT",
      "ADD COLUMN IF NOT EXISTS vapi_phone_number_id TEXT", 
      "ADD COLUMN IF NOT EXISTS vapi_webhook_url TEXT",
      "ADD COLUMN IF NOT EXISTS vapi_settings JSONB DEFAULT '{}'::jsonb"
    ];
    
    for (const columnDef of columns) {
      console.log(`🔄 Adding: ${columnDef}`);
      
      const { error } = await supabase.rpc('execute_sql', {
        sql: `ALTER TABLE organizations ${columnDef};`
      });
      
      if (error && !error.message.includes('already exists')) {
        console.log(`⚠️ Column may already exist: ${error.message}`);
      } else {
        console.log('✅ Column added successfully');
      }
    }
    
    console.log('🎉 VAPI columns migration completed!');
    
    // Verify the new columns exist
    const { data: orgs, error: selectError } = await supabase
      .from('organizations')
      .select('id, name, vapi_api_key, vapi_assistant_id, vapi_phone_number_id, vapi_webhook_url, vapi_settings')
      .limit(1);
      
    if (selectError) {
      console.error('❌ Error verifying columns:', selectError);
    } else {
      console.log('✅ VAPI columns verified successfully!');
      if (orgs.length > 0) {
        console.log('📋 Available VAPI columns:');
        Object.keys(orgs[0]).forEach(key => {
          if (key.startsWith('vapi_')) {
            console.log(`  ✓ ${key}: ${orgs[0][key] || 'null'}`);
          }
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error applying migration:', error);
  }
}

applyVapiMigration().catch(console.error); 