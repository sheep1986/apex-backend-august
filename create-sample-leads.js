const { createClient } = require('@supabase/supabase-js');
const { config } = require('dotenv');

// Load environment variables
config();

async function createSampleLeads() {
  console.log('📝 Creating sample leads...');
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing environment variables');
    return;
  }
  
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Check what organizations exist
    console.log('🔍 Checking existing organizations...');
    const { data: orgs, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .limit(5);
    
    if (orgError) {
      console.error('❌ Failed to fetch organizations:', orgError.message);
      return;
    }
    
    console.log('📋 Found organizations:', orgs);
    
    if (!orgs || orgs.length === 0) {
      console.error('❌ No organizations found. Need to create one first.');
      return;
    }
    
    // Use the first organization
    const orgId = orgs[0].id;
    console.log(`✅ Using organization: ${orgs[0].name} (${orgId})`);
    
    // Sample leads data (using only confirmed existing fields)
    const sampleLeads = [
      {
        first_name: 'John',
        last_name: 'Smith',
        email: 'john.smith@techcorp.com',
        phone: '+1-555-123-4567',
        organization_id: orgId
      },
      {
        first_name: 'Sarah',
        last_name: 'Johnson',
        email: 'sarah.j@healthcare.com',
        phone: '+1-555-987-6543',
        organization_id: orgId
      },
      {
        first_name: 'Mike',
        last_name: 'Davis',
        email: 'mike.davis@startup.com',
        phone: '+1-555-456-7890',
        organization_id: orgId
      },
      {
        first_name: 'Emily',
        last_name: 'Chen',
        email: 'emily.chen@consulting.com',
        phone: '+1-555-321-0987',
        organization_id: orgId
      },
      {
        first_name: 'David',
        last_name: 'Rodriguez',
        email: 'david@realestate.com',
        phone: '+1-555-654-3210',
        organization_id: orgId
      }
    ];
    
    console.log(`📝 Inserting ${sampleLeads.length} sample leads...`);
    
    // Clear existing test leads first
    await supabase
      .from('leads')
      .delete()
      .in('email', sampleLeads.map(lead => lead.email));
    
    // Insert sample leads
    const { data: insertedLeads, error: insertError } = await supabase
      .from('leads')
      .insert(sampleLeads)
      .select();
    
    if (insertError) {
      console.error('❌ Failed to insert leads:', insertError.message);
      console.error('Details:', insertError);
    } else {
      console.log('✅ Sample leads created successfully!');
      console.log(`📊 Created ${insertedLeads.length} leads`);
      
      // Show what columns are available
      if (insertedLeads.length > 0) {
        console.log('\n📋 Available columns in leads table:');
        console.log(Object.keys(insertedLeads[0]).join(', '));
        
        console.log('\n📄 Sample lead data:');
        console.log(JSON.stringify(insertedLeads[0], null, 2));
      }
    }
    
  } catch (error) {
    console.error('❌ Sample lead creation failed:', error.message);
  }
}

// Run the script
createSampleLeads(); 