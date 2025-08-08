const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testInvitationsTable() {
  console.log('🔍 Testing invitations table...\n');

  try {
    // 1. Check if table exists
    console.log('1️⃣ Checking if invitations table exists...');
    const { data: tables, error: tableError } = await supabase
      .from('invitations')
      .select('id')
      .limit(1);

    if (tableError) {
      console.error('❌ Table check failed:', tableError.message);
      return;
    }
    console.log('✅ Invitations table exists\n');

    // 2. Get a test user
    console.log('2️⃣ Getting test user (Qasim Afzal)...');
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', '04467fd1-d132-4b45-81e0-6722bfae8f2c')
      .single();

    if (userError || !user) {
      console.error('❌ Could not find test user:', userError?.message);
      return;
    }
    console.log('✅ Found user:', {
      id: user.id,
      email: user.email,
      name: `${user.first_name} ${user.last_name}`,
      organization_id: user.organization_id
    });
    console.log('');

    // 3. Check for existing invitations
    console.log('3️⃣ Checking for existing invitations...');
    const { data: existingInvites, error: existingError } = await supabase
      .from('invitations')
      .select('*')
      .eq('email', user.email)
      .eq('organization_id', user.organization_id);

    if (existingError) {
      console.error('❌ Error checking existing invitations:', existingError);
    } else {
      console.log(`✅ Found ${existingInvites?.length || 0} existing invitations`);
      if (existingInvites?.length > 0) {
        console.log('Existing invitations:', existingInvites);
      }
    }
    console.log('');

    // 4. Try to create a test invitation
    console.log('4️⃣ Attempting to create test invitation...');
    const testInvitation = {
      email: user.email,
      organization_id: user.organization_id,
      role: user.role || 'client_admin',
      token: 'test-token-' + Date.now(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending',
      first_name: user.first_name || 'Test',
      last_name: user.last_name || 'User'
    };

    console.log('📝 Invitation data:', testInvitation);

    const { data: newInvite, error: createError } = await supabase
      .from('invitations')
      .insert(testInvitation)
      .select()
      .single();

    if (createError) {
      console.error('❌ Failed to create invitation:', createError);
      console.error('Error details:', {
        message: createError.message,
        code: createError.code,
        hint: createError.hint,
        details: createError.details
      });
    } else {
      console.log('✅ Successfully created invitation:', newInvite);
      
      // Clean up test invitation
      const { error: deleteError } = await supabase
        .from('invitations')
        .delete()
        .eq('id', newInvite.id);
      
      if (!deleteError) {
        console.log('🧹 Cleaned up test invitation');
      }
    }

  } catch (error) {
    console.error('💥 Unexpected error:', error);
  }
}

testInvitationsTable();