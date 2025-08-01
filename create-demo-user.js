const { createClient } = require('@supabase/supabase-js');

// Demo user configuration
const DEMO_USER = {
  email: 'demo@apex.ai',
  first_name: 'Demo',
  last_name: 'User',
  role: 'admin',
  clerk_user_id: 'demo_user_123',
  is_active: true
};

// Demo account configuration
const DEMO_ACCOUNT = {
  name: 'Apex Demo Account',
  slug: 'apex-demo',
  plan_type: 'enterprise',
  billing_email: 'demo@apex.ai',
  settings: {
    timezone: 'America/New_York',
    currency: 'USD',
    language: 'en'
  },
  limits: {
    max_users: 50,
    max_campaigns: 100,
    max_leads: 10000,
    max_calls_per_month: 50000
  },
  usage_stats: {
    total_calls: 0,
    total_leads: 0,
    total_campaigns: 0
  }
};

async function createDemoUser() {
  const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
  const supabaseKey = process.env.SUPABASE_ANON_KEY || 'your-anon-key';
  
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('🚀 Creating demo account and user...');

    // Create demo account
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .insert([DEMO_ACCOUNT])
      .select()
      .single();

    if (accountError) {
      if (accountError.code === '23505') {
        console.log('📝 Demo account already exists, using existing account...');
        const { data: existingAccount } = await supabase
          .from('accounts')
          .select('*')
          .eq('slug', 'apex-demo')
          .single();
        account = existingAccount;
      } else {
        throw accountError;
      }
    } else {
      console.log('✅ Demo account created successfully');
    }

    // Check if demo user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', DEMO_USER.email)
      .single();

    if (existingUser) {
      console.log('📝 Demo user already exists, updating...');
      
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          ...DEMO_USER,
          account_id: account.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingUser.id)
        .select()
        .single();

      if (updateError) throw updateError;
      console.log('✅ Demo user updated successfully');
      return updatedUser;
    }

    // Create the demo user
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert([{
        ...DEMO_USER,
        account_id: account.id
      }])
      .select()
      .single();

    if (userError) throw userError;

    console.log('✅ Demo user created successfully');
    console.log('\n📋 Demo User Details:');
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.first_name} ${user.last_name}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Account: ${account.name}`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   Account ID: ${account.id}`);
    
    console.log('\n🔗 You can now use these credentials to log in:');
    console.log(`   Email: ${user.email}`);

    return user;

  } catch (error) {
    console.error('❌ Error creating demo user:', error);
    throw error;
  }
}

createDemoUser()
  .then(() => {
    console.log('\n🎉 Demo user setup complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Demo user setup failed:', error);
    process.exit(1);
  });
