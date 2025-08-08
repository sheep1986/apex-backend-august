#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.HE0QhxO85CDPWLRVPm1YEjYrZpq4Ni6q1U9q7n7-jhI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function resetUserPassword(email, newPassword = 'temppassword123') {
  try {
    console.log('🔄 Resetting password for:', email);
    
    // Update user password using admin API
    const { data, error } = await supabase.auth.admin.updateUserById(
      // First, find the user by email
      await findUserByEmail(email),
      { password: newPassword }
    );
    
    if (error) {
      throw error;
    }
    
    console.log('✅ Password reset successfully!');
    console.log('📧 Email:', email);
    console.log('🔑 New password:', newPassword);
    console.log('');
    console.log('You can now sign in with these credentials.');
    
  } catch (error) {
    console.error('❌ Error resetting password:', error.message);
  }
}

async function findUserByEmail(email) {
  try {
    const { data: users, error } = await supabase.auth.admin.listUsers();
    
    if (error) throw error;
    
    const user = users.users.find(u => u.email === email);
    if (!user) {
      throw new Error(`User with email ${email} not found`);
    }
    
    return user.id;
  } catch (error) {
    throw new Error(`Failed to find user: ${error.message}`);
  }
}

async function listAllUsers() {
  try {
    console.log('👥 Listing all users in the system:');
    console.log('');
    
    const { data: users, error } = await supabase.auth.admin.listUsers();
    
    if (error) throw error;
    
    if (users.users.length === 0) {
      console.log('No users found in the system.');
      return;
    }
    
    for (const user of users.users) {
      console.log(`📧 Email: ${user.email}`);
      console.log(`🆔 ID: ${user.id}`);
      console.log(`📅 Created: ${user.created_at}`);
      console.log(`✅ Confirmed: ${user.email_confirmed_at ? 'Yes' : 'No'}`);
      console.log('---');
    }
    
    return users.users;
  } catch (error) {
    console.error('❌ Error listing users:', error.message);
  }
}

async function main() {
  const command = process.argv[2];
  const email = process.argv[3];
  const password = process.argv[4];
  
  if (command === 'list') {
    await listAllUsers();
  } else if (command === 'reset' && email) {
    await resetUserPassword(email, password);
  } else {
    console.log('Usage:');
    console.log('  node reset-user-password.js list                          - List all users');
    console.log('  node reset-user-password.js reset <email> [password]     - Reset user password');
    console.log('');
    console.log('Examples:');
    console.log('  node reset-user-password.js list');
    console.log('  node reset-user-password.js reset sean@artificialmedia.co.uk');
    console.log('  node reset-user-password.js reset sean@artificialmedia.co.uk newpassword123');
  }
}

main();