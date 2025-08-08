const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('URL:', supabaseUrl);
console.log('Key exists:', Boolean(supabaseServiceKey));

if (!supabaseServiceKey) {
  console.error('No service role key found in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkAndUpdateUser() {
  // First check the user
  const { data: user, error: fetchError } = await supabase
    .from('users')
    .select('id, email, role, organization_id')
    .eq('email', 'sean@artificialmedia.co.uk')
    .single();
    
  if (fetchError) {
    console.error('Error fetching user:', fetchError);
    return;
  }
  
  console.log('Current user data:', JSON.stringify(user, null, 2));
  
  // Update user role to platform_owner if needed
  if (user.role !== 'platform_owner') {
    console.log('\nUpdating user role to platform_owner...');
    
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({ role: 'platform_owner' })
      .eq('id', user.id)
      .select()
      .single();
      
    if (updateError) {
      console.error('Error updating role:', updateError);
    } else {
      console.log('Updated user data:', JSON.stringify(updatedUser, null, 2));
    }
  } else {
    console.log('\nUser already has platform_owner role');
  }
}

checkAndUpdateUser().catch(console.error);