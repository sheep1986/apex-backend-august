const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testOrgCreation() {
  console.log('🧪 Testing organization creation directly...\n');

  const timestamp = Date.now();
  const testOrgData = {
    name: `Test Company ${timestamp}`,
    slug: `test-company-${timestamp}`,
    type: 'agency',
    status: 'active',
    plan: 'professional',
    monthly_cost: 599.00,
    primary_color: '#3B82F6',
    secondary_color: '#1e40af',
    call_limit: 1000,
    user_limit: 10,
    storage_limit_gb: 10
  };

  console.log('📋 Attempting to create organization with data:');
  console.log(JSON.stringify(testOrgData, null, 2));

  const { data, error } = await supabase
    .from('organizations')
    .insert(testOrgData)
    .select()
    .single();

  if (error) {
    console.error('\n❌ Error creating organization:');
    console.error('Code:', error.code);
    console.error('Message:', error.message);
    console.error('Details:', error.details);
    console.error('Hint:', error.hint);
  } else {
    console.log('\n✅ Organization created successfully!');
    console.log('ID:', data.id);
    console.log('Name:', data.name);
    
    // Clean up - delete the test org
    const { error: deleteError } = await supabase
      .from('organizations')
      .delete()
      .eq('id', data.id);
      
    if (!deleteError) {
      console.log('\n🧹 Test organization cleaned up');
    }
  }
}

testOrgCreation();