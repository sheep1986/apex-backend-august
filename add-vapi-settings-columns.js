const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function addVAPISettingsColumns() {
  try {
    console.log('🔧 Adding VAPI settings columns to organizations table...');
    
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, 'database', 'add-vapi-settings-column.sql');
    let sql;
    
    if (fs.existsSync(sqlFilePath)) {
      sql = fs.readFileSync(sqlFilePath, 'utf8');
    } else {
      // Fallback: Define SQL directly
      sql = `
        -- Add VAPI settings columns to organizations table
        ALTER TABLE organizations 
        ADD COLUMN IF NOT EXISTS vapi_settings JSONB DEFAULT '{}';
        
        -- Add a general settings column for future use
        ALTER TABLE organizations 
        ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
        
        -- Add individual VAPI columns for better query performance
        ALTER TABLE organizations 
        ADD COLUMN IF NOT EXISTS vapi_api_key VARCHAR(255);
        
        ALTER TABLE organizations 
        ADD COLUMN IF NOT EXISTS vapi_private_key VARCHAR(255);
        
        ALTER TABLE organizations 
        ADD COLUMN IF NOT EXISTS vapi_webhook_url VARCHAR(255) DEFAULT 'https://api.apexai.com/webhooks/vapi';
        
        -- Update the updated_at timestamp to refresh schema cache
        UPDATE organizations SET updated_at = NOW() WHERE 1=1;
      `;
    }
    
    // Execute the SQL
    console.log('📝 Executing SQL migration...');
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      console.error('❌ Error executing SQL:', error);
      
      // Try executing each statement individually
      console.log('🔄 Trying to execute statements individually...');
      
      const statements = [
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS vapi_settings JSONB DEFAULT '{}'",
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'",
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS vapi_api_key VARCHAR(255)",
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS vapi_private_key VARCHAR(255)",
        "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS vapi_webhook_url VARCHAR(255) DEFAULT 'https://api.apexai.com/webhooks/vapi'",
        "UPDATE organizations SET updated_at = NOW() WHERE 1=1"
      ];
      
      for (const statement of statements) {
        try {
          console.log(`📝 Executing: ${statement}`);
          const { error: stmtError } = await supabase.rpc('exec_sql', { sql_query: statement });
          if (stmtError) {
            console.error(`❌ Error with statement "${statement}":`, stmtError);
          } else {
            console.log('✅ Statement executed successfully');
          }
        } catch (err) {
          console.error(`❌ Exception with statement "${statement}":`, err);
        }
      }
    } else {
      console.log('✅ SQL migration executed successfully');
    }
    
    // Test the new columns
    console.log('🧪 Testing new columns...');
    const { data: testData, error: testError } = await supabase
      .from('organizations')
      .select('id, name, vapi_settings, settings, vapi_api_key')
      .limit(1);
    
    if (testError) {
      console.error('❌ Error testing new columns:', testError);
    } else {
      console.log('✅ New columns are working! Sample data:', testData);
    }
    
    console.log('🎉 VAPI settings columns added successfully!');
    console.log('');
    console.log('📋 Next steps:');
    console.log('1. Go to Settings page in your frontend');
    console.log('2. Enter your VAPI credentials');
    console.log('3. Click "Save Changes"');
    console.log('4. The credentials should now save successfully!');
    
  } catch (error) {
    console.error('❌ Error adding VAPI settings columns:', error);
  }
}

// Run the migration
addVAPISettingsColumns(); 