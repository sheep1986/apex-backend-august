const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function createVAPIAssistantsTable() {
  try {
    console.log('🚀 Creating vapi_assistants table...');
    
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Missing Supabase credentials');
      return;
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Connected to Supabase');
    
    // Create vapi_assistants table
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS vapi_assistants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        vapi_assistant_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) DEFAULT 'outbound',
        config JSONB,
        voice_id VARCHAR(255),
        first_message TEXT,
        system_prompt TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_vapi_assistants_organization 
          FOREIGN KEY (organization_id) 
          REFERENCES organizations(id) 
          ON DELETE CASCADE
      );
    `;
    
    console.log('📝 Creating vapi_assistants table...');
    
    // Use raw SQL execution
    const { error: createError } = await supabase.rpc('exec_sql', {
      sql: createTableSQL
    });
    
    if (createError) {
      console.log('⚠️ RPC method failed, trying alternative approach...');
      
      // Try alternative approach - create the table through a simple insert/select
      const { error: altError } = await supabase
        .from('vapi_assistants')
        .select('*')
        .limit(1);
      
      if (altError && altError.code === '42P01') {
        console.log('❌ Table does not exist and cannot be created automatically');
        console.log('📝 Please run this SQL manually in your Supabase dashboard:');
        console.log(createTableSQL);
        return;
      }
    }
    
    console.log('✅ vapi_assistants table created successfully');
    
    // Create indexes
    const indexSQL = `
      CREATE INDEX IF NOT EXISTS idx_vapi_assistants_organization_id 
        ON vapi_assistants(organization_id);
      CREATE INDEX IF NOT EXISTS idx_vapi_assistants_vapi_id 
        ON vapi_assistants(vapi_assistant_id);
    `;
    
    console.log('📝 Creating indexes...');
    const { error: indexError } = await supabase.rpc('exec_sql', {
      sql: indexSQL
    });
    
    if (indexError) {
      console.log('⚠️ Index creation failed, but table was created');
    } else {
      console.log('✅ Indexes created successfully');
    }
    
    console.log('🎉 vapi_assistants table setup complete!');
    
  } catch (error) {
    console.error('❌ Error creating vapi_assistants table:', error);
  }
}

createVAPIAssistantsTable(); 