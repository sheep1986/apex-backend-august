require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkCurrentUsers() {
  try {
    console.log('🔍 Current User State Check');
    console.log('============================\n');

    // Get all active users with organization info
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
        created_at,
        organizations (
          id,
          name,
          vapi_api_key,
          vapi_private_key
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
      console.log(`   - Status: ${user.status}`);
      console.log(`   - Organization: ${user.organizations?.name || 'NO ORGANIZATION'} (${user.organization_id})`);
      
      if (user.organizations) {
        const hasVapiPublic = !!user.organizations.vapi_api_key;
        const hasVapiPrivate = !!user.organizations.vapi_private_key;
        console.log(`   - VAPI Public Key: ${hasVapiPublic ? '✅ YES' : '❌ NO'}`);
        console.log(`   - VAPI Private Key: ${hasVapiPrivate ? '✅ YES' : '❌ NO'}`);
        
        if (hasVapiPublic) {
          console.log(`   - Public Key Preview: ${user.organizations.vapi_api_key.substring(0, 8)}...`);
        }
        if (hasVapiPrivate) {
          console.log(`   - Private Key Preview: ${user.organizations.vapi_private_key.substring(0, 8)}...`);
        }
      }
      
      console.log(`   - Created: ${new Date(user.created_at).toLocaleString()}`);
      console.log('');
    }

    console.log('\n💡 To test VAPI integration in the campaign wizard:');
    console.log('1. Make sure you\'re logged in as a user from Test Corp or Artificial Media Platform');
    console.log('2. These organizations have working VAPI credentials');
    console.log('3. Users from Emerald Green Energy Ltd will see errors (invalid credentials)');
    console.log('4. Users from Platform organization have no VAPI setup');

  } catch (error) {
    console.error('❌ Error running user check:', error);
  }
}

// Run the check
checkCurrentUsers();