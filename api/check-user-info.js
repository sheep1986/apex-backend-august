import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkUserInfo() {
  console.log('🔍 Checking user information...\n');
  
  try {
    // Check the user who created campaigns
    const userId = '0117fd9c-c80c-4084-a1be-3e40d4c93773';
    
    const { data: user, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, role')
      .eq('id', userId)
      .single();
      
    if (user) {
      console.log('Campaign creator user:');
      console.log(`  Name: ${user.first_name} ${user.last_name}`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Role: ${user.role}`);
      console.log(`  ID: ${user.id}`);
    } else {
      console.log('User not found!');
    }
    
    // Check all users in the organization
    console.log('\n\nAll users in organization:');
    const { data: allUsers } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, role')
      .eq('organization_id', '2566d8c5-2245-4a3c-b539-4cea21a07d9b')
      .order('first_name');
      
    allUsers?.forEach(u => {
      console.log(`  - ${u.first_name} ${u.last_name} (${u.role})`);
    });
    
  } catch (err) {
    console.error('Error:', err);
  }
}

checkUserInfo();