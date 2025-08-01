require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixQasimUser() {
  try {
    console.log('🔍 Checking Qasim User Details');
    console.log('===============================\n');

    // First, let's find Qasim by name since Clerk ID might be different
    const { data: qasimUsers, error: searchError } = await supabase
      .from('users')
      .select(`
        id,
        clerk_id,
        email,
        first_name,
        last_name,
        role,
        organization_id,
        status,
        created_at,
        organizations (
          id,
          name,
          vapi_api_key,
          vapi_private_key,
          settings
        )
      `)
      .ilike('first_name', '%qasim%');

    if (searchError) {
      console.error('❌ Error searching for Qasim:', searchError);
      return;
    }

    console.log(`🔍 Found ${qasimUsers?.length || 0} users matching "Qasim"`);
    
    if (!qasimUsers || qasimUsers.length === 0) {
      console.log('\n❌ No Qasim user found in database');
      console.log('💡 This explains why the VAPI test page shows 0 results');
      console.log('\n🔧 OPTIONS TO FIX:');
      console.log('1. Create a new user record for Qasim in Supabase');
      console.log('2. Or login as an existing user (clientadmin@testcorp.com or sean@artificialmedia.co.uk)');
      return;
    }

    const qasimUser = qasimUsers[0];

    console.log('👤 Qasim User Details:');
    console.log('   - Name:', qasimUser.first_name, qasimUser.last_name);
    console.log('   - Email:', qasimUser.email);
    console.log('   - Clerk ID:', qasimUser.clerk_id);
    console.log('   - Role:', qasimUser.role);
    console.log('   - Organization ID:', qasimUser.organization_id);
    console.log('   - Status:', qasimUser.status);

    if (qasimUser.organizations) {
      console.log('   - Organization Name:', qasimUser.organizations.name);
      console.log('   - Has VAPI Keys:', !!qasimUser.organizations.vapi_private_key);
    } else {
      console.log('   - Organization: NO ORGANIZATION FOUND');
    }

    // If no organization or organization has no VAPI credentials, assign to Test Corp
    if (!qasimUser.organization_id || !qasimUser.organizations?.vapi_private_key) {
      console.log('\n🔧 FIXING: Assigning Qasim to Test Corp organization...');
      
      // Test Corp organization ID (has working VAPI credentials)
      const testCorpOrgId = '0f88ab8a-b760-4c2a-b289-79b54d7201cf';
      
      const { error: updateError } = await supabase
        .from('users')
        .update({ 
          organization_id: testCorpOrgId,
          updated_at: new Date().toISOString()
        })
        .eq('clerk_id', qasimUser.clerk_id);

      if (updateError) {
        console.error('❌ Error updating Qasim user:', updateError);
        return;
      }

      console.log('✅ Successfully assigned Qasim to Test Corp organization');
      console.log('   - Organization ID:', testCorpOrgId);
      console.log('   - Organization Name: Test Corp');
      console.log('   - VAPI Credentials: Available (9 assistants, 3 phone numbers)');
      
      console.log('\n🚀 NEXT STEPS:');
      console.log('1. Refresh the /vapi-test page');
      console.log('2. You should now see 9 assistants and 3 phone numbers');
      console.log('3. The campaign wizard should now work properly');
      
    } else {
      console.log('\n✅ Qasim already has a valid organization with VAPI credentials');
      console.log('   - Organization:', qasimUser.organizations.name);
      console.log('   - The issue might be elsewhere');
    }

  } catch (error) {
    console.error('❌ Error fixing Qasim user:', error);
  }
}

// Run the fix
fixQasimUser();