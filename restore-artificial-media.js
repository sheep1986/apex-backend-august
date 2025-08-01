require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function restoreArtificialMedia() {
  try {
    console.log('🔧 Restoring Artificial Media Platform');
    console.log('======================================\n');

    const artificialMediaOrgId = '47a8e3ea-cd34-4746-a786-dd31e8f8105e';
    const seanClerkId = 'user_2zVJzaukJKKI2vfeC1Zuj874HHq';

    // Get current VAPI credentials from Emerald Green (they should be the working ones)
    const { data: emeraldGreen, error: emeraldError } = await supabase
      .from('organizations')
      .select('vapi_api_key, vapi_private_key, settings')
      .eq('id', '2566d8c5-2245-4a3c-b539-4cea21a07d9b')
      .single();

    if (emeraldError || !emeraldGreen) {
      console.error('❌ Error getting Emerald Green credentials:', emeraldError);
      return;
    }

    console.log('✅ Got working VAPI credentials from Emerald Green Energy');

    // Recreate Artificial Media Platform organization
    console.log('\n🏢 Recreating Artificial Media Platform organization...');
    
    const { error: insertOrgError } = await supabase
      .from('organizations')
      .insert({
        id: artificialMediaOrgId,
        name: 'Artificial Media Platform',
        slug: 'artificial-media-platform',
        type: 'agency',
        vapi_api_key: emeraldGreen.vapi_api_key,
        vapi_private_key: emeraldGreen.vapi_private_key,
        settings: emeraldGreen.settings,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (insertOrgError) {
      console.error('❌ Error recreating Artificial Media Platform:', insertOrgError);
      return;
    }

    console.log('✅ Successfully recreated Artificial Media Platform');

    // Move Sean back to Artificial Media Platform
    console.log('\n👤 Moving Sean back to Artificial Media Platform...');
    
    const { error: updateUserError } = await supabase
      .from('users')
      .update({
        organization_id: artificialMediaOrgId,
        updated_at: new Date().toISOString()
      })
      .eq('clerk_id', seanClerkId);

    if (updateUserError) {
      console.error('❌ Error moving Sean back:', updateUserError);
      return;
    }

    console.log('✅ Successfully moved Sean back to Artificial Media Platform');

    // Verify the restoration
    console.log('\n🎯 Verification:');
    
    const { data: finalUsers, error: verifyError } = await supabase
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

    if (verifyError) {
      console.error('❌ Error verifying restoration:', verifyError);
      return;
    }

    console.log('📋 Final user assignments:');
    finalUsers?.forEach(user => {
      console.log(`   - ${user.first_name} ${user.last_name}: ${user.organizations?.name}`);
      console.log(`     Has VAPI Keys: ${user.organizations?.vapi_private_key ? 'YES' : 'NO'}`);
      console.log(`     Email: ${user.email}`);
    });

    console.log('\n✅ Restoration complete!');
    console.log('\n📋 Current organizations:');
    console.log('   - Emerald Green Energy Ltd (Qasim\'s business)');
    console.log('   - Artificial Media Platform (Sean\'s business)');
    console.log('   - Both have working VAPI credentials');

  } catch (error) {
    console.error('❌ Error during restoration:', error);
  }
}

// Run the restoration
restoreArtificialMedia();