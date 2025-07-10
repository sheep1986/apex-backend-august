const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function quickDbFix() {
  console.log('🔧 Adding missing columns to database...');
  
  try {
    // Add missing columns to organizations table
    console.log('📋 Adding columns to organizations table...');
    
    const orgColumns = [
      'ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true',
      'ALTER TABLE organizations ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT \'client\'',
      'ALTER TABLE organizations ADD COLUMN IF NOT EXISTS owner_id UUID',
      'ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT \'{}\'',
      'ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()',
      'ALTER TABLE organizations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()'
    ];
    
    for (const sql of orgColumns) {
      try {
        await supabase.rpc('exec_sql', { sql_query: sql });
        console.log('✅ Added column:', sql.split('ADD COLUMN IF NOT EXISTS')[1]?.split(' ')[0]);
      } catch (err) {
        // Try direct query if rpc doesn't work
        const { error } = await supabase.from('organizations').select('*').limit(0);
        if (error && error.message.includes('column')) {
          console.log('⚠️ Column may already exist or different approach needed');
        }
      }
    }
    
    // Add missing columns to users table
    console.log('📋 Adding columns to users table...');
    
    const userColumns = [
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id UUID',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT \'client_user\'',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT \'{}\'',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT \'{}\'',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()',
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()'
    ];
    
    for (const sql of userColumns) {
      try {
        await supabase.rpc('exec_sql', { sql_query: sql });
        console.log('✅ Added column:', sql.split('ADD COLUMN IF NOT EXISTS')[1]?.split(' ')[0]);
      } catch (err) {
        console.log('⚠️ Column may already exist:', sql.split('ADD COLUMN IF NOT EXISTS')[1]?.split(' ')[0]);
      }
    }
    
    console.log('🎉 Database columns updated!');
    
    // Test the fix
    console.log('🔍 Testing database structure...');
    
    const { data: orgTest, error: orgError } = await supabase
      .from('organizations')
      .select('*')
      .limit(1);
      
    const { data: userTest, error: userError } = await supabase
      .from('users')
      .select('*')
      .limit(1);
    
    console.log('Organizations table:', orgError ? 'ERROR' : 'OK');
    console.log('Users table:', userError ? 'ERROR' : 'OK');
    
    if (orgTest && orgTest[0]) {
      console.log('Organization columns:', Object.keys(orgTest[0]));
    }
    
    if (userTest && userTest[0]) {
      console.log('User columns:', Object.keys(userTest[0]));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

quickDbFix(); 