const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('🔄 Running email verification table migration...');

  try {
    // First, let's check if the table exists
    const { data: tableExists } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_name', 'email_verifications')
      .eq('table_schema', 'public');

    if (!tableExists || tableExists.length === 0) {
      console.log('📝 Creating email_verifications table...');
      // We'll create the table manually using the Supabase dashboard
      console.log('⚠️  Please create the email_verifications table manually in Supabase dashboard');
      console.log('   Table structure:');
      console.log('   - id: UUID (primary key, default: gen_random_uuid())');
      console.log('   - organization_id: UUID (foreign key to organizations.id)');
      console.log('   - user_id: UUID (foreign key to users.id)');
      console.log('   - email: VARCHAR(255)');
      console.log('   - token: VARCHAR(255) (unique)');
      console.log('   - expires_at: TIMESTAMP WITH TIME ZONE');
      console.log('   - verified_at: TIMESTAMP WITH TIME ZONE (nullable)');
      console.log('   - created_at: TIMESTAMP WITH TIME ZONE (default: NOW())');
      console.log('   - updated_at: TIMESTAMP WITH TIME ZONE (default: NOW())');
    } else {
      console.log('✅ Email verification table already exists');
    }

    // Check if new columns exist in organizations table
    const { data: orgColumns } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'organizations')
      .eq('table_schema', 'public')
      .in('column_name', ['email_verified_at', 'team_size', 'vapi_api_key', 'vapi_private_key', 'country', 'website', 'industry']);

    const existingColumns = orgColumns?.map(col => col.column_name) || [];
    const requiredColumns = ['email_verified_at', 'team_size', 'vapi_api_key', 'vapi_private_key', 'country', 'website', 'industry'];
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));

    if (missingColumns.length > 0) {
      console.log('⚠️  Missing columns in organizations table:', missingColumns);
      console.log('   Please add these columns manually in Supabase dashboard:');
      missingColumns.forEach(col => {
        console.log(`   - ${col}: ${getColumnType(col)}`);
      });
    } else {
      console.log('✅ All required columns exist in organizations table');
    }

    console.log('🎉 Migration check completed!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

function getColumnType(columnName) {
  const types = {
    'email_verified_at': 'TIMESTAMP WITH TIME ZONE (nullable)',
    'team_size': 'VARCHAR(10) (nullable)',
    'vapi_api_key': 'TEXT (nullable)',
    'vapi_private_key': 'TEXT (nullable)',
    'country': 'VARCHAR(100) (nullable)',
    'website': 'TEXT (nullable)',
    'industry': 'VARCHAR(100) (nullable)'
  };
  return types[columnName] || 'TEXT';
}

runMigration(); 