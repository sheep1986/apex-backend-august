const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function simpleCheck() {
  console.log('🔍 Testing database connection...');
  
  try {
    // Try to fetch from users table
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .limit(1);
      
    if (usersError) {
      console.log('❌ Users table error:', usersError.message);
    } else {
      console.log('✅ Users table accessible, found', users.length, 'records');
      if (users.length > 0) {
        console.log('📋 User columns:', Object.keys(users[0]));
      }
    }
    
    // Try to fetch from organizations table
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('*')
      .limit(1);
      
    if (orgsError) {
      console.log('❌ Organizations table error:', orgsError.message);
    } else {
      console.log('✅ Organizations table accessible, found', orgs.length, 'records');
      if (orgs.length > 0) {
        console.log('📋 Organization columns:', Object.keys(orgs[0]));
      }
    }
    
    // Try to create an organization first
    console.log('\n🏢 Creating test organization...');
    const { data: newOrg, error: createOrgError } = await supabase
      .from('organizations')
      .insert({
        name: 'Test Organization',
        slug: 'test-org-' + Date.now()
      })
      .select()
      .single();
      
    if (createOrgError) {
      console.log('❌ Organization creation failed:', createOrgError.message);
    } else {
      console.log('✅ Organization created:', newOrg.id);
      
      // Now try to create a user
      console.log('\n👤 Creating test user...');
      const { data: newUser, error: createUserError } = await supabase
        .from('users')
        .insert({
          first_name: 'Test',
          last_name: 'User',
          email: 'test@example.com',
          role: 'admin', // Use basic role
          organization_id: newOrg.id
        })
        .select()
        .single();
        
      if (createUserError) {
        console.log('❌ User creation failed:', createUserError.message);
      } else {
        console.log('✅ User created:', newUser.id);
      }
    }
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
  }
}

simpleCheck(); 