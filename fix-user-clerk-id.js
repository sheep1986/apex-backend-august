const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixUserClerkId() {
  try {
    const email = 'seanwentz99@gmail.com';
    const clerkUserId = 'user_2tFeS5bqmOFxmjLo1oStHCuDkxM';
    
    console.log(`🔧 Updating Clerk ID for ${email} to ${clerkUserId}`);
    
    const { data, error } = await supabase
      .from('users')
      .update({ clerk_id: clerkUserId })
      .eq('email', email)
      .select();
      
    if (error) {
      console.error('❌ Error updating user:', error);
      return;
    }
    
    if (data && data.length > 0) {
      console.log('✅ User updated successfully:', data[0]);
    } else {
      console.log('❌ No user found with email:', email);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

fixUserClerkId();