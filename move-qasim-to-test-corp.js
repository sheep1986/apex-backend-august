require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function moveQasimToTestCorp() {
  try {
    console.log('🔧 Moving Qasim to Test Corp Organization');
    console.log('========================================\n');

    // Test Corp organization ID (has working VAPI credentials)
    const testCorpOrgId = '0f88ab8a-b760-4c2a-b289-79b54d7201cf';
    const qasimClerkId = 'user_30YowJ7d9kTMTfyzUZFVkFv7tCZ';

    console.log('📋 Current Status:');
    console.log('   - Qasim is in: Emerald Green Energy Ltd (invalid VAPI credentials)');
    console.log('   - Moving to: Test Corp (working VAPI credentials)');
    console.log('   - Expected result: 9 assistants, 3 phone numbers available\n');

    // Update Qasim's organization
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        organization_id: testCorpOrgId,
        updated_at: new Date().toISOString()
      })
      .eq('clerk_id', qasimClerkId);

    if (updateError) {
      console.error('❌ Error updating Qasim user:', updateError);
      return;
    }

    console.log('✅ Successfully moved Qasim to Test Corp!');
    console.log('\n🎯 Verification:');
    
    // Verify the update
    const { data: updatedUser, error: verifyError } = await supabase
      .from('users')
      .select(`
        first_name,
        last_name,
        organization_id,
        organizations (
          name,
          vapi_private_key
        )
      `)
      .eq('clerk_id', qasimClerkId)
      .single();

    if (verifyError || !updatedUser) {
      console.error('❌ Error verifying update:', verifyError);
      return;
    }

    console.log('   - User:', updatedUser.first_name, updatedUser.last_name);
    console.log('   - New Organization:', updatedUser.organizations?.name);
    console.log('   - Has VAPI Keys:', !!updatedUser.organizations?.vapi_private_key);
    console.log('   - Organization ID:', updatedUser.organization_id);

    console.log('\n🚀 NEXT STEPS:');
    console.log('1. Refresh the /vapi-test page');
    console.log('2. You should now see 9 assistants and 3 phone numbers');
    console.log('3. The campaign wizard should now work properly');
    console.log('4. Both dropdowns should populate with VAPI data');
    
  } catch (error) {
    console.error('❌ Error moving Qasim to Test Corp:', error);
  }
}

// Run the fix
moveQasimToTestCorp();