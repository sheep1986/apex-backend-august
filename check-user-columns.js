const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkUserColumns() {
  try {
    // Get a user to see the columns
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'seanwentz99@gmail.com')
      .limit(1);
      
    if (error) {
      console.error('Error:', error);
      return;
    }
    
    if (users && users.length > 0) {
      console.log('User columns:');
      console.log(Object.keys(users[0]));
      console.log('\nUser data:');
      console.log(users[0]);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkUserColumns();