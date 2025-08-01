require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixEmeraldGreenVAPI() {
  try {
    console.log('🔧 Fixing Emerald Green Energy VAPI Credentials');
    console.log('===============================================\n');

    const emeraldGreenOrgId = '2566d8c5-2245-4a3c-b539-4cea21a07d9b';
    const qasimClerkId = 'user_30YowJ7d9kTMTfyzUZFVkFv7tCZ';

    // First, get the working VAPI credentials from Test Corp
    const { data: testCorp, error: testCorpError } = await supabase
      .from('organizations')
      .select('vapi_api_key, vapi_private_key, settings')
      .eq('id', '0f88ab8a-b760-4c2a-b289-79b54d7201cf')
      .single();

    if (testCorpError || !testCorp) {
      console.error('❌ Could not get Test Corp credentials:', testCorpError);
      return;
    }

    console.log('📋 Current Status:');
    console.log('   - Test Corp has working VAPI credentials ✅');
    console.log('   - Emerald Green Energy has invalid VAPI credentials ❌');
    console.log('   - Qasim is currently assigned to Test Corp');
    console.log('\n🔧 Plan:');
    console.log('   1. Copy working VAPI credentials to Emerald Green Energy');
    console.log('   2. Move Qasim back to his real business (Emerald Green Energy)');

    // Copy working VAPI credentials to Emerald Green Energy
    console.log('\n🔧 Step 1: Updating Emerald Green Energy VAPI credentials...');
    
    const { error: updateOrgError } = await supabase
      .from('organizations')
      .update({
        vapi_api_key: testCorp.vapi_api_key,
        vapi_private_key: testCorp.vapi_private_key,
        settings: {
          ...testCorp.settings,
          vapi: {
            ...testCorp.settings?.vapi,
            enabled: true
          }
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', emeraldGreenOrgId);

    if (updateOrgError) {
      console.error('❌ Error updating Emerald Green credentials:', updateOrgError);
      return;
    }

    console.log('✅ Successfully updated Emerald Green Energy VAPI credentials');

    // Move Qasim back to Emerald Green Energy
    console.log('\n🔧 Step 2: Moving Qasim back to Emerald Green Energy...');
    
    const { error: updateUserError } = await supabase
      .from('users')
      .update({
        organization_id: emeraldGreenOrgId,
        updated_at: new Date().toISOString()
      })
      .eq('clerk_id', qasimClerkId);

    if (updateUserError) {
      console.error('❌ Error moving Qasim back to Emerald Green:', updateUserError);
      return;
    }

    console.log('✅ Successfully moved Qasim back to Emerald Green Energy');

    // Verify the changes
    console.log('\n🎯 Verification:');
    
    const { data: updatedUser, error: verifyError } = await supabase
      .from('users')
      .select(`
        first_name,
        last_name,
        organization_id,
        organizations (
          name,
          vapi_private_key,
          vapi_api_key
        )
      `)
      .eq('clerk_id', qasimClerkId)
      .single();

    if (verifyError || !updatedUser) {
      console.error('❌ Error verifying changes:', verifyError);
      return;
    }

    console.log('   - User:', updatedUser.first_name, updatedUser.last_name);
    console.log('   - Organization:', updatedUser.organizations?.name);
    console.log('   - Has VAPI Private Key:', !!updatedUser.organizations?.vapi_private_key);
    console.log('   - Has VAPI Public Key:', !!updatedUser.organizations?.vapi_api_key);

    console.log('\n🚀 NEXT STEPS:');
    console.log('1. Refresh the /vapi-test page');
    console.log('2. Qasim should now be back in his real business');
    console.log('3. Emerald Green Energy should have working VAPI credentials');
    console.log('4. You should see 9 assistants and 3 phone numbers');
    console.log('5. Campaign wizard should work with Qasim\'s real business');

  } catch (error) {
    console.error('❌ Error fixing Emerald Green VAPI:', error);
  }
}

// Run the fix
fixEmeraldGreenVAPI();