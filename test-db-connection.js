const { createClient } = require('@supabase/supabase-js');
const { config } = require('dotenv');

// Load environment variables
config();

async function testDatabase() {
  console.log('🔍 Testing Database Connection...');
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  console.log('Environment Variables:');
  console.log('- SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing');
  console.log('- SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? 'Set' : 'Missing');
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing environment variables');
    return;
  }
  
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase client created');
    
    // Test connection by checking users table
    console.log('\n🔍 Testing users table...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, first_name, last_name, email')
      .limit(5);
    
    if (usersError) {
      console.error('❌ Users table error:', usersError.message);
    } else {
      console.log('✅ Users table accessible');
      console.log('Found users:', users?.length || 0);
    }
    
    // Test leads table
    console.log('\n🔍 Testing leads table...');
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, first_name, last_name, email, phone, company')
      .limit(5);
    
    if (leadsError) {
      console.error('❌ Leads table error:', leadsError.message);
      console.error('Details:', leadsError);
    } else {
      console.log('✅ Leads table accessible');
      console.log('Found leads:', leads?.length || 0);
      if (leads && leads.length > 0) {
        console.log('Sample lead:', leads[0]);
      }
    }
    
    // Test creating a sample lead
    console.log('\n🔍 Testing lead creation...');
    const { data: newLead, error: createError } = await supabase
      .from('leads')
      .insert([{
        first_name: 'Test',
        last_name: 'Lead',
        email: 'test@example.com',
        phone: '+1234567890',
        company: 'Test Company',
        status: 'new',
        priority: 'medium',
        source: 'api_test',
        organization_id: '550e8400-e29b-41d4-a716-446655440000'
      }])
      .select()
      .single();
    
    if (createError) {
      console.error('❌ Lead creation error:', createError.message);
      console.error('Details:', createError);
    } else {
      console.log('✅ Lead created successfully');
      console.log('New lead:', newLead);
    }
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
  }
}

// Run the test
testDatabase(); 