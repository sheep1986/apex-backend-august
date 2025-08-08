const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deleteTestOrgAndUser() {
  console.log('🗑️  Starting cleanup of test organization and user...\n');

  try {
    // 1. First find the user in the database
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'seanwentz99@gmail.com')
      .single();

    if (dbError && dbError.code !== 'PGRST116') {
      console.error('Error finding database user:', dbError);
      return;
    }

    if (dbUser) {
      console.log('📊 Found database user:');
      console.log(`   Email: ${dbUser.email}`);
      console.log(`   Role: ${dbUser.role}`);
      console.log(`   Org ID: ${dbUser.organization_id}`);
      console.log(`   User ID: ${dbUser.id}\n`);

      // 2. Delete the user from database
      const { error: deleteUserError } = await supabase
        .from('users')
        .delete()
        .eq('id', dbUser.id);

      if (deleteUserError) {
        console.error('Error deleting database user:', deleteUserError);
      } else {
        console.log('✅ Deleted database user record');
      }

      // 3. Check if we should delete the organization
      const { data: orgUsers, error: orgUsersError } = await supabase
        .from('users')
        .select('id')
        .eq('organization_id', dbUser.organization_id);

      if (!orgUsersError && orgUsers.length === 0) {
        // No more users in this org, safe to delete
        const { error: deleteOrgError } = await supabase
          .from('organizations')
          .delete()
          .eq('id', dbUser.organization_id);

        if (deleteOrgError) {
          console.error('Error deleting organization:', deleteOrgError);
        } else {
          console.log('✅ Deleted organization (no remaining users)');
        }
      } else {
        console.log('ℹ️  Organization has other users, not deleting');
      }
    } else {
      console.log('❌ No database user found for seanwentz99@gmail.com');
    }

    // 4. Delete from auth.users
    console.log('\n🔐 Checking Supabase Auth...');
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('Error listing auth users:', listError);
      return;
    }

    const authUser = users.find(u => u.email === 'seanwentz99@gmail.com');
    if (authUser) {
      console.log(`   Found auth user: ${authUser.id}`);
      
      const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(authUser.id);
      
      if (deleteAuthError) {
        console.error('Error deleting auth user:', deleteAuthError);
      } else {
        console.log('✅ Deleted auth user');
      }
    } else {
      console.log('❌ No auth user found for seanwentz99@gmail.com');
    }

    console.log('\n🎉 Cleanup complete!');
    console.log('You can now create a fresh organization and user.');

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

deleteTestOrgAndUser();