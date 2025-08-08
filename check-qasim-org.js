const supabase = require('@supabase/supabase-js');

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';

const supabaseClient = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function checkQasimData() {
  console.log('🔍 Checking Qasim user data and contacts...\n');
  
  // Check Qasim's user data
  const { data: users, error: userError } = await supabaseClient
    .from('users')
    .select('*')
    .eq('email', 'seanwentz99@gmail.com');
  
  if (userError) {
    console.error('❌ Error fetching user:', userError);
    return;
  }
  
  if (users && users.length > 0) {
    const user = users[0];
    console.log('👤 User: Qasim Afzal');
    console.log(`  Email: ${user.email}`);
    console.log(`  Clerk ID: ${user.clerk_id}`);
    console.log(`  Organization ID: ${user.organization_id}`);
    console.log(`  Status: ${user.status}`);
    
    // Check contacts for this organization
    const { data: contacts, error: contactError } = await supabaseClient
      .from('contacts')
      .select('*')
      .eq('organization_id', user.organization_id);
      
    if (contactError) {
      console.error('❌ Error fetching contacts:', contactError);
      return;
    }
    
    console.log(`\n📊 Total contacts in organization: ${contacts?.length || 0}`);
    if (contacts && contacts.length > 0) {
      console.log('\n📋 Contacts:');
      contacts.forEach(contact => {
        console.log(`  - ${contact.first_name} ${contact.last_name} (${contact.phone})`);
      });
    }
  } else {
    console.log('⚠️ User not found');
  }
}

checkQasimData().then(() => process.exit(0));
