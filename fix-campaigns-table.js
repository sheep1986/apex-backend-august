const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.log('❌ No Supabase key found in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixCampaignsTable() {
  console.log('🔧 Creating campaigns table and adding sample data...');
  
  try {
    // Create campaigns table
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS campaigns (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        type VARCHAR(50) DEFAULT 'outbound',
        industry VARCHAR(100),
        target_audience TEXT,
        script TEXT,
        voice_settings JSONB DEFAULT '{}',
        schedule JSONB DEFAULT '{}',
        budget DECIMAL(10, 2),
        phone_numbers JSONB DEFAULT '[]',
        status VARCHAR(50) DEFAULT 'draft',
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        started_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE
      );
    `;
    
    await supabase.rpc('exec_sql', { sql: createTableSQL });
    console.log('✅ Campaigns table created/verified');
    
    // Create campaign_metrics table
    const createMetricsTableSQL = `
      CREATE TABLE IF NOT EXISTS campaign_metrics (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        total_calls INTEGER DEFAULT 0,
        connected_calls INTEGER DEFAULT 0,
        conversion_rate DECIMAL(5, 2) DEFAULT 0,
        average_duration INTEGER DEFAULT 0,
        total_cost DECIMAL(10, 2) DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    
    await supabase.rpc('exec_sql', { sql: createMetricsTableSQL });
    console.log('✅ Campaign metrics table created/verified');
    
    // Get the first organization
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id')
      .limit(1);
      
    if (!orgs || orgs.length === 0) {
      console.log('❌ No organizations found');
      return;
    }
    
    const orgId = orgs[0].id;
    console.log('📋 Using organization:', orgId);
    
    // Check if campaigns already exist
    const { data: existingCampaigns } = await supabase
      .from('campaigns')
      .select('id')
      .eq('organization_id', orgId)
      .limit(1);
      
    if (existingCampaigns && existingCampaigns.length > 0) {
      console.log('✅ Campaigns already exist');
      return;
    }
    
    // Insert sample campaigns that match the Dashboard
    const sampleCampaigns = [
      {
        organization_id: orgId,
        name: 'Test Campaign',
        description: 'Test campaign for development',
        type: 'outbound',
        industry: 'Technology',
        status: 'active',
        budget: 1000.00,
        target_audience: 'Tech companies interested in AI solutions',
        script: 'Hello, this is a test campaign script...'
      },
      {
        organization_id: orgId,
        name: 'Holiday Promotion',
        description: 'Special holiday season outreach campaign',
        type: 'outbound',
        industry: 'Retail',
        status: 'active',
        budget: 2500.00,
        target_audience: 'Retail businesses preparing for holiday sales',
        script: 'Hi! We have a special holiday promotion for your business...'
      },
      {
        organization_id: orgId,
        name: 'New Product Launch',
        description: 'Campaign to introduce our new AI assistant features',
        type: 'outbound',
        industry: 'Technology',
        status: 'draft',
        budget: 5000.00,
        target_audience: 'Early adopters and tech enthusiasts',
        script: 'Exciting news! We\'re launching revolutionary new AI features...'
      }
    ];
    
    const { data: insertedCampaigns, error: insertError } = await supabase
      .from('campaigns')
      .insert(sampleCampaigns)
      .select();
      
    if (insertError) {
      console.log('❌ Error inserting campaigns:', insertError);
      return;
    }
    
    console.log('✅ Inserted', insertedCampaigns.length, 'sample campaigns');
    
    // Create metrics for each campaign
    const metrics = insertedCampaigns.map(campaign => ({
      campaign_id: campaign.id,
      total_calls: Math.floor(Math.random() * 500) + 100,
      connected_calls: Math.floor(Math.random() * 300) + 50,
      conversion_rate: Math.random() * 30 + 10,
      average_duration: Math.floor(Math.random() * 300) + 60,
      total_cost: Math.random() * 500 + 100
    }));
    
    const { error: metricsError } = await supabase
      .from('campaign_metrics')
      .insert(metrics);
      
    if (metricsError) {
      console.log('❌ Error inserting metrics:', metricsError);
    } else {
      console.log('✅ Created metrics for campaigns');
    }
    
    // Verify the data
    const { data: finalCampaigns } = await supabase
      .from('campaigns')
      .select('id, name, status, type')
      .eq('organization_id', orgId);
      
    console.log('\n📊 Final campaigns:', finalCampaigns);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixCampaignsTable().then(() => process.exit(0));