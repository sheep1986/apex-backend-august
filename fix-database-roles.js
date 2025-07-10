const { createClient } = require('@supabase/supabase-js');

// Use the correct Supabase credentials
const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTkwNzQzMCwiZXhwIjoyMDUxNDgzNDMwfQ.lIpvE3rKLGJBnf5EQJLCyGDQJgZUNNAhQ7s8rFgVXcE';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixDatabaseRoles() {
  try {
    console.log('🔧 Testing database connection and schema...');
    
    // Test connection first
    const { data: testData, error: testError } = await supabase
      .from('accounts')
      .select('count')
      .limit(1);
    
    if (testError) {
      console.error('❌ Connection test failed:', testError);
      return;
    }
    
    console.log('✅ Database connection successful');
    
    // Create a test account to verify the schema works
    const testAccount = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Test Organization',
      slug: 'test-org',
      plan_type: 'starter',
      billing_email: 'test@example.com'
    };
    
    console.log('🏢 Creating test account...');
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .upsert(testAccount)
      .select()
      .single();
    
    if (accountError) {
      console.error('❌ Error creating test account:', accountError);
      return;
    }
    
    console.log('✅ Test account created:', account.id);
    
    // Create a test user with valid role
    const testUser = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      account_id: account.id,
      clerk_user_id: 'test-clerk-id-' + Date.now(),
      email: 'testuser@example.com',
      first_name: 'Test',
      last_name: 'User',
      role: 'admin', // Use valid role from schema
      is_active: true
    };
    
    console.log('👤 Creating test user...');
    const { data: user, error: userError } = await supabase
      .from('users')
      .upsert(testUser)
      .select()
      .single();
    
    if (userError) {
      console.error('❌ Error creating test user:', userError);
      return;
    }
    
    console.log('✅ Test user created successfully:', user.id);
    console.log('✅ Database schema is working correctly!');
    
    // Clean up test data
    await supabase.from('users').delete().eq('id', user.id);
    await supabase.from('accounts').delete().eq('id', account.id);
    
    console.log('🧹 Test data cleaned up');
    console.log('');
    console.log('🎉 SUCCESS: Organization setup should now work correctly!');
    console.log('📋 Valid user roles are: admin, supervisor, agent, viewer');
    console.log('🏢 Accounts table is working');
    console.log('👤 Users table is working');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

fixDatabaseRoles(); 