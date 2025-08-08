const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function createCampaignsTable() {
  console.log('🏗️ Creating campaigns table...');
  
  // First check if table exists
  const { data: tables } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_name', 'campaigns');
    
  if (tables && tables.length > 0) {
    console.log('✅ Campaigns table already exists');
  } else {
    console.log('📋 Creating campaigns table...');
    
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS campaigns (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) DEFAULT 'outbound',
        campaign_type VARCHAR(50) DEFAULT 'b2b',
        objective TEXT,
        status VARCHAR(50) DEFAULT 'draft',
        daily_budget_limit DECIMAL(10, 2),
        total_budget DECIMAL(10, 2),
        credits_used INTEGER DEFAULT 0,
        phone_numbers TEXT[],
        vapi_integration_enabled BOOLEAN DEFAULT true,
        voice_agent_id VARCHAR(255),
        voice_agent_name VARCHAR(255),
        voice_agent_config JSONB,
        total_calls INTEGER DEFAULT 0,
        successful_calls INTEGER DEFAULT 0,
        interested_leads_count INTEGER DEFAULT 0,
        conversion_rate DECIMAL(5, 2) DEFAULT 0,
        average_call_duration INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_by UUID REFERENCES users(id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_campaigns_org_type ON campaigns(organization_id, type);
    `;
    
    const { error } = await supabase.rpc('exec_sql', { sql: createTableSQL });
    
    if (error) {
      console.error('❌ Error creating table:', error);
      
      // Fallback: try manual creation
      console.log('🔄 Trying manual table creation...');
      const { error: manualError } = await supabase
        .from('campaigns')
        .select('count(*)')
        .single();
        
      if (manualError && manualError.message.includes('does not exist')) {
        console.log('❌ Table creation failed. Please run the SQL manually.');
        console.log('SQL:', createTableSQL);
      }
    } else {
      console.log('✅ Campaigns table created successfully');
    }
  }
  
  // Now add sample campaign data
  console.log('📊 Adding sample campaign data...');
  
  // Get organization ID
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id')
    .limit(1);
    
  if (!orgs || orgs.length === 0) {
    console.log('❌ No organizations found');
    return;
  }
  
  const orgId = orgs[0].id;
  console.log('🏢 Using organization ID:', orgId);
  
  // Check if campaigns already exist
  const { data: existingCampaigns } = await supabase
    .from('campaigns')
    .select('id')
    .eq('organization_id', orgId)
    .eq('type', 'outbound');
    
  if (existingCampaigns && existingCampaigns.length > 0) {
    console.log('✅ Sample campaigns already exist');
    return;
  }
  
  // Insert sample campaigns
  const sampleCampaigns = [
    {
      organization_id: orgId,
      name: 'Q4 Enterprise Outreach',
      type: 'outbound',
      campaign_type: 'b2b',
      objective: 'Generate qualified leads for enterprise software solutions',
      status: 'active',
      daily_budget_limit: 500.00,
      total_budget: 5000.00,
      voice_agent_name: 'Professional Sales Agent',
      total_calls: 45,
      successful_calls: 12,
      interested_leads_count: 8,
      conversion_rate: 26.67,
      average_call_duration: 180
    },
    {
      organization_id: orgId,
      name: 'Holiday Promotion Campaign',
      type: 'outbound',
      campaign_type: 'b2c',
      objective: 'Promote holiday special offers to existing customers',
      status: 'active',
      daily_budget_limit: 300.00,
      total_budget: 2000.00,
      voice_agent_name: 'Friendly Customer Agent',
      total_calls: 78,
      successful_calls: 23,
      interested_leads_count: 19,
      conversion_rate: 29.49,
      average_call_duration: 120
    },
    {
      organization_id: orgId,
      name: 'New Product Launch',
      type: 'outbound',
      campaign_type: 'b2b',
      objective: 'Introduce new AI features to existing business clients',
      status: 'draft',
      daily_budget_limit: 1000.00,
      total_budget: 10000.00,
      voice_agent_name: 'Expert Product Specialist',
      total_calls: 0,
      successful_calls: 0,
      interested_leads_count: 0,
      conversion_rate: 0,
      average_call_duration: 0
    }
  ];
  
  const { data: insertedCampaigns, error: insertError } = await supabase
    .from('campaigns')
    .insert(sampleCampaigns)
    .select();
    
  if (insertError) {
    console.error('❌ Error inserting campaigns:', insertError);
  } else {
    console.log('✅ Inserted', insertedCampaigns.length, 'sample campaigns');
    console.log('📋 Sample campaigns:', insertedCampaigns.map(c => ({ id: c.id, name: c.name, status: c.status })));
  }
}

createCampaignsTable().then(() => process.exit(0));