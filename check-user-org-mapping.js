require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkUserOrgMapping() {
  try {
    console.log('🔍 User-Organization VAPI Mapping Check');
    console.log('==========================================\n');

    // Get all users with their organization details and VAPI credentials
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select(`
        clerk_id,
        email,
        first_name,
        last_name,
        role,
        organization_id,
        status,
        organizations (
          id,
          name,
          vapi_api_key,
          vapi_private_key,
          settings
        )
      `)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
      return;
    }

    console.log(`📋 Found ${users?.length || 0} active users\n`);

    for (const user of users || []) {
      console.log(`👤 User: ${user.first_name} ${user.last_name} (${user.email})`);
      console.log(`   - Clerk ID: ${user.clerk_id}`);
      console.log(`   - Role: ${user.role}`);
      console.log(`   - Organization: ${user.organizations?.name || 'NO ORGANIZATION'}`);
      console.log(`   - Org ID: ${user.organization_id}`);
      
      if (user.organizations) {
        const hasVapiPublic = !!user.organizations.vapi_api_key;
        const hasVapiPrivate = !!user.organizations.vapi_private_key;
        const hasVapiSettings = !!user.organizations.settings?.vapi;
        
        console.log(`   - VAPI Public Key: ${hasVapiPublic ? '✅ YES' : '❌ NO'}`);
        console.log(`   - VAPI Private Key: ${hasVapiPrivate ? '✅ YES' : '❌ NO'}`);
        console.log(`   - VAPI Settings: ${hasVapiSettings ? '✅ YES' : '❌ NO'}`);
        
        if (hasVapiPrivate) {
          console.log(`   - Private Key Preview: ${user.organizations.vapi_private_key.substring(0, 8)}...`);
        }
        
        // Determine VAPI status
        if (hasVapiPrivate || hasVapiSettings) {
          console.log(`   - 🟢 VAPI STATUS: SHOULD WORK`);
        } else if (hasVapiPublic) {
          console.log(`   - 🟡 VAPI STATUS: PARTIAL (only public key)`);
        } else {
          console.log(`   - 🔴 VAPI STATUS: NO CREDENTIALS`);
        }
      } else {
        console.log(`   - 🔴 VAPI STATUS: NO ORGANIZATION`);
      }
      
      console.log('');
    }

    // Specific check for "Qasim" user who was logged in
    console.log('\n🎯 Specific Check for Current User (Qasim):');
    const qasimUser = users?.find(u => u.first_name === 'Qasim' || u.email?.includes('qasim'));
    
    if (qasimUser) {
      console.log(`✅ Found Qasim: ${qasimUser.email}`);
      console.log(`   - Organization: ${qasimUser.organizations?.name}`);
      console.log(`   - Has VAPI Credentials: ${qasimUser.organizations?.vapi_private_key ? 'YES' : 'NO'}`);
      
      if (!qasimUser.organizations?.vapi_private_key) {
        console.log('\n❌ PROBLEM IDENTIFIED:');
        console.log('   Qasim\'s organization does not have VAPI credentials!');
        console.log('   This is why the campaign wizard shows 0 assistants/phone numbers.');
        console.log('\n💡 SOLUTIONS:');
        console.log('   1. Add VAPI credentials to Qasim\'s organization');
        console.log('   2. Or login as a user from Test Corp or Artificial Media Platform');
        console.log('   3. Or switch Qasim to an organization with VAPI credentials');
      } else {
        console.log('\n✅ Qasim should be able to see VAPI data');
      }
    } else {
      console.log('❌ Could not find Qasim user in database');
    }

    console.log('\n📋 SUMMARY:');
    console.log('Organizations with working VAPI credentials:');
    const workingOrgs = users?.filter(u => 
      u.organizations?.vapi_private_key || u.organizations?.settings?.vapi
    );
    
    if (workingOrgs && workingOrgs.length > 0) {
      workingOrgs.forEach(u => {
        console.log(`   - ${u.organizations.name} (User: ${u.first_name} ${u.last_name})`);
      });
    } else {
      console.log('   - None found');
    }

  } catch (error) {
    console.error('❌ Error running user-org mapping check:', error);
  }
}

// Run the check
checkUserOrgMapping();