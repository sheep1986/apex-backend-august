require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function cleanupTestOrganizations() {
  try {
    console.log('🧹 Cleaning Up Test Organizations');
    console.log('=================================\n');

    const testCorpOrgId = '0f88ab8a-b760-4c2a-b289-79b54d7201cf';
    const platformOrgId = '00000000-0000-0000-0000-000000000000';
    const artificialMediaOrgId = '47a8e3ea-cd34-4746-a786-dd31e8f8105e';

    // First, check if any users are still assigned to these orgs
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('first_name, last_name, email, organization_id, organizations(name)')
      .in('organization_id', [testCorpOrgId, platformOrgId, artificialMediaOrgId]);

    if (usersError) {
      console.error('❌ Error checking users:', usersError);
      return;
    }

    if (users && users.length > 0) {
      console.log('⚠️ Found users still assigned to test organizations:');
      users.forEach(user => {
        console.log(`   - ${user.first_name} ${user.last_name} (${user.email}) → ${user.organizations?.name}`);
      });
      console.log('\n🔧 Moving these users to Emerald Green Energy Ltd...');
      
      const emeraldGreenOrgId = '2566d8c5-2245-4a3c-b539-4cea21a07d9b';
      
      for (const user of users) {
        const { error: moveError } = await supabase
          .from('users')
          .update({ organization_id: emeraldGreenOrgId })
          .eq('organization_id', user.organization_id);
        
        if (moveError) {
          console.error(`❌ Error moving user ${user.email}:`, moveError);
        } else {
          console.log(`✅ Moved ${user.first_name} ${user.last_name} to Emerald Green Energy`);
        }
      }
    }

    // Delete the test organizations
    console.log('\n🗑️ Deleting test organizations...');
    
    const orgsToDelete = [
      { id: testCorpOrgId, name: 'Test Corp' },
      { id: platformOrgId, name: 'Platform' },
      { id: artificialMediaOrgId, name: 'Artificial Media Platform' }
    ];

    for (const org of orgsToDelete) {
      const { error: deleteError } = await supabase
        .from('organizations')
        .delete()
        .eq('id', org.id);

      if (deleteError) {
        console.error(`❌ Error deleting ${org.name}:`, deleteError);
      } else {
        console.log(`✅ Deleted ${org.name}`);
      }
    }

    console.log('\n✅ Cleanup complete!');
    console.log('\n📋 Remaining organization:');
    console.log('   - Emerald Green Energy Ltd (Qasim\'s real business)');

    // Verify final state
    const { data: finalUsers, error: finalError } = await supabase
      .from('users')
      .select(`
        first_name,
        last_name,
        email,
        organization_id,
        organizations (
          name,
          vapi_private_key
        )
      `)
      .eq('status', 'active');

    if (!finalError && finalUsers) {
      console.log('\n🎯 Final user assignments:');
      finalUsers.forEach(user => {
        console.log(`   - ${user.first_name} ${user.last_name}: ${user.organizations?.name}`);
        console.log(`     Has VAPI Keys: ${user.organizations?.vapi_private_key ? 'YES' : 'NO'}`);
      });
    }

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  }
}

// Run the cleanup
cleanupTestOrganizations();