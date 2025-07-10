require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createVAPITables() {
  try {
    console.log('🚀 Creating VAPI assistants table...');
    
    // Create vapi_assistants table
    const { error: assistantsError } = await supabase.sql`
      CREATE TABLE IF NOT EXISTS vapi_assistants (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        vapi_assistant_id VARCHAR(255) NOT NULL,
        description TEXT,
        model VARCHAR(100),
        voice_id VARCHAR(255),
        first_message TEXT,
        system_prompt TEXT,
        temperature DECIMAL(3,2) DEFAULT 0.7,
        max_tokens INTEGER DEFAULT 1000,
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        CONSTRAINT vapi_assistants_org_vapi_id_unique UNIQUE (organization_id, vapi_assistant_id)
      );
    `;
    
    if (assistantsError) {
      console.log('❌ Error creating vapi_assistants table:', assistantsError);
    } else {
      console.log('✅ vapi_assistants table created successfully');
    }
    
    console.log('🚀 Creating VAPI phone numbers table...');
    
    // Create vapi_phone_numbers table
    const { error: phoneError } = await supabase.sql`
      CREATE TABLE IF NOT EXISTS vapi_phone_numbers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        number VARCHAR(20) NOT NULL,
        vapi_phone_number_id VARCHAR(255) NOT NULL,
        provider VARCHAR(50),
        country_code VARCHAR(5),
        area_code VARCHAR(10),
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        CONSTRAINT vapi_phone_numbers_org_vapi_id_unique UNIQUE (organization_id, vapi_phone_number_id)
      );
    `;
    
    if (phoneError) {
      console.log('❌ Error creating vapi_phone_numbers table:', phoneError);
    } else {
      console.log('✅ vapi_phone_numbers table created successfully');
    }
    
    console.log('🚀 Creating indexes...');
    
    // Create indexes
    const { error: indexError1 } = await supabase.sql`
      CREATE INDEX IF NOT EXISTS idx_vapi_assistants_org_id ON vapi_assistants(organization_id);
    `;
    
    const { error: indexError2 } = await supabase.sql`
      CREATE INDEX IF NOT EXISTS idx_vapi_phone_numbers_org_id ON vapi_phone_numbers(organization_id);
    `;
    
    if (indexError1 || indexError2) {
      console.log('⚠️ Some indexes may not have been created:', { indexError1, indexError2 });
    } else {
      console.log('✅ Indexes created successfully');
    }
    
    console.log('🎉 VAPI tables creation completed!');
    
  } catch (error) {
    console.error('❌ Error creating VAPI tables:', error);
  }
}

createVAPITables(); 