require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function activateQasimUser() {
  try {
    console.log('🔧 Activating Qasim User Account');
    console.log('=================================\n');

    const qasimClerkId = 'user_30YowJ7d9kTMTfyzUZFVkFv7tCZ';

    // First, check current status
    const { data: currentUser, error: checkError } = await supabase
      .from('users')
      .select('first_name, last_name, email, status, organization_id')
      .eq('clerk_id', qasimClerkId)
      .single();

    if (checkError) {
      console.error('❌ Error finding Qasim:', checkError);
      return;
    }

    console.log('👤 Current Qasim Status:');
    console.log('   - Name:', currentUser.first_name, currentUser.last_name);
    console.log('   - Email:', currentUser.email);
    console.log('   - Status:', currentUser.status);
    console.log('   - Organization ID:', currentUser.organization_id);

    if (currentUser.status === 'active') {
      console.log('\n✅ Qasim is already active');
      return;
    }

    // Update status to active
    console.log('\n🔧 Changing status from "invited" to "active"...');
    
    const { error: updateError } = await supabase
      .from('users')
      .update({ 
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('clerk_id', qasimClerkId);

    if (updateError) {
      console.error('❌ Error activating user:', updateError);
      return;
    }

    // Verify the update
    const { data: updatedUser, error: verifyError } = await supabase
      .from('users')
      .select(`
        first_name,
        last_name,
        status,
        organization_id,
        organizations (
          name,
          vapi_private_key
        )
      `)
      .eq('clerk_id', qasimClerkId)
      .single();

    if (verifyError) {
      console.error('❌ Error verifying update:', verifyError);
      return;
    }

    console.log('✅ Successfully activated Qasim user!');
    console.log('\n🎯 Updated Status:');
    console.log('   - Name:', updatedUser.first_name, updatedUser.last_name);
    console.log('   - Status:', updatedUser.status);
    console.log('   - Organization:', updatedUser.organizations?.name);
    console.log('   - Has VAPI Keys:', !!updatedUser.organizations?.vapi_private_key);

    console.log('\n🚀 NEXT STEPS:');
    console.log('1. Refresh the /vapi-test page');
    console.log('2. Backend should now find Qasim as an active user');
    console.log('3. VAPI data should load (9 assistants, 3 phone numbers)');
    console.log('4. Campaign wizard should work properly');

  } catch (error) {
    console.error('❌ Error activating Qasim user:', error);
  }
}

// Run the activation
activateQasimUser();