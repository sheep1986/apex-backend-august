#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.log('Please add it to your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTables() {
  console.log('🚀 Creating API Configuration tables...');
  
  try {
    // Create the main api_configurations table
    console.log('📝 Creating api_configurations table...');
    const { error: tableError } = await supabase.rpc('sql', {
      query: `
        CREATE TABLE IF NOT EXISTS api_configurations (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
          service_name TEXT NOT NULL,
          configuration JSONB NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
          created_by UUID REFERENCES users(id),
          updated_by UUID REFERENCES users(id),
          UNIQUE(organization_id, service_name)
        );`
    });

    if (tableError) {
      console.warn('⚠️ Table creation warning:', tableError.message);
    } else {
      console.log('✅ api_configurations table created');
    }

    // Create audit table
    console.log('📝 Creating api_configuration_audit table...');
    const { error: auditError } = await supabase.rpc('sql', {
      query: `
        CREATE TABLE IF NOT EXISTS api_configuration_audit (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          configuration_id UUID,
          organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
          service_name TEXT NOT NULL,
          action TEXT NOT NULL,
          changed_by UUID REFERENCES users(id),
          changed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
          old_configuration JSONB,
          new_configuration JSONB
        );`
    });

    if (auditError) {
      console.warn('⚠️ Audit table warning:', auditError.message);
    } else {
      console.log('✅ api_configuration_audit table created');
    }

    // Create indexes
    console.log('📝 Creating indexes...');
    await supabase.rpc('sql', {
      query: `CREATE INDEX IF NOT EXISTS idx_api_configurations_org_service ON api_configurations(organization_id, service_name);`
    });
    
    await supabase.rpc('sql', {
      query: `CREATE INDEX IF NOT EXISTS idx_api_configurations_service ON api_configurations(service_name);`
    });

    console.log('✅ Indexes created');

    // Enable RLS
    console.log('📝 Enabling Row Level Security...');
    await supabase.rpc('sql', {
      query: `ALTER TABLE api_configurations ENABLE ROW LEVEL SECURITY;`
    });
    
    console.log('✅ Row Level Security enabled');

    console.log('🎉 API Configuration schema setup completed!');
    
    // Test table existence
    console.log('🔍 Verifying tables...');
    const { data: tables, error: checkError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['api_configurations', 'api_configuration_audit']);
    
    if (checkError) {
      console.warn('⚠️ Could not verify tables:', checkError.message);
    } else {
      console.log('✅ Found tables:', tables.map(t => t.table_name));
    }

  } catch (error) {
    console.error('❌ Error creating tables:', error.message);
  }
}

// Run the function
createTables().then(() => {
  console.log('✨ Setup complete!');
  process.exit(0);
}).catch(err => {
  console.error('💥 Setup failed:', err);
  process.exit(1);
});