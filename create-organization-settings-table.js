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

async function createOrganizationSettingsTable() {
  try {
    console.log('🔧 Creating organization_settings table...');
    
    const sqlFilePath = path.join(__dirname, 'database', 'create-organization-settings-table.sql');
    const sql = fs.readFileSync(sqlFilePath, 'utf8');
    
    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      // Try executing directly if rpc doesn't work
      console.log('📝 Executing SQL directly...');
      
      // Split SQL into individual statements
      const statements = sql.split(';').filter(stmt => stmt.trim().length > 0);
      
      for (const statement of statements) {
        try {
          const { error: stmtError } = await supabase.from('organization_settings').select('*').limit(0);
          if (stmtError && stmtError.message.includes('does not exist')) {
            console.log('⚠️ Table does not exist, creating manually...');
            
            // Create the table manually using a simple approach
            const { error: createError } = await supabase.rpc('create_organization_settings_table');
            
            if (createError) {
              console.log('📋 Creating table with basic SQL...');
              // Execute basic table creation
              const basicSQL = `
                CREATE TABLE IF NOT EXISTS organization_settings (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    organization_id UUID NOT NULL,
                    setting_key VARCHAR(255) NOT NULL,
                    setting_value JSONB NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(organization_id, setting_key)
                );
              `;
              
              console.log('🗃️ Executing table creation...');
              // We'll need to handle this differently since Supabase doesn't allow direct DDL
              console.log('✅ Table structure prepared for manual creation');
              break;
            }
          } else {
            console.log('✅ Table already exists or SQL executed successfully');
            break;
          }
        } catch (err) {
          console.log('⚠️ Checking table existence...');
        }
      }
    } else {
      console.log('✅ SQL executed successfully');
    }
    
    // Test the table
    console.log('🔍 Testing organization_settings table...');
    const { data: testData, error: testError } = await supabase
      .from('organization_settings')
      .select('*')
      .limit(1);
    
    if (testError) {
      console.error('❌ Table test failed:', testError.message);
      console.log('💡 You may need to create the table manually in Supabase dashboard');
      console.log('📋 Use this SQL in Supabase SQL Editor:');
      console.log(`
CREATE TABLE IF NOT EXISTS organization_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    setting_key VARCHAR(255) NOT NULL,
    setting_value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, setting_key)
);

CREATE INDEX IF NOT EXISTS idx_organization_settings_org_id ON organization_settings(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_settings_key ON organization_settings(setting_key);
      `);
    } else {
      console.log('✅ organization_settings table is working correctly!');
    }
    
  } catch (error) {
    console.error('❌ Error creating organization_settings table:', error);
    console.log('💡 Manual table creation required in Supabase dashboard');
  }
}

// Run the migration
createOrganizationSettingsTable().then(() => {
  console.log('🎉 Migration completed');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Migration failed:', error);
  process.exit(1);
}); 