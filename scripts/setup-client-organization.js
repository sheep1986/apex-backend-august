#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const readline = require('readline');

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';

const supabase = createClient(supabaseUrl, supabaseKey);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

async function setupClientOrganization() {
  console.log('🚀 Apex AI Calling Platform - Client Organization Setup\n');
  
  try {
    // Gather organization information
    console.log('📋 Organization Information:');
    const orgName = await askQuestion('Organization Name: ');
    const orgDomain = await askQuestion('Domain (optional): ');
    const orgAddress = await askQuestion('Address (optional): ');
    
    console.log('\n👤 Primary Admin User Information:');
    const adminFirstName = await askQuestion('Admin First Name: ');
    const adminLastName = await askQuestion('Admin Last Name: ');
    const adminEmail = await askQuestion('Admin Email: ');
    const adminPhone = await askQuestion('Admin Phone (optional): ');
    
    console.log('\n💼 Subscription Information:');
    const subscriptionPlan = await askQuestion('Subscription Plan (starter/professional/enterprise) [starter]: ') || 'starter';
    
    // Validate inputs
    if (!orgName || !adminFirstName || !adminLastName || !adminEmail) {
      console.error('❌ Missing required information');
      process.exit(1);
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(adminEmail)) {
      console.error('❌ Invalid email format');
      process.exit(1);
    }
    
    // Generate organization details
    const orgId = uuidv4();
    const orgSlug = generateSlug(orgName);
    
    console.log('\n🔍 Validating setup...');
    
    // Check if organization slug already exists
    const { data: existingOrg } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('slug', orgSlug)
      .single();
    
    if (existingOrg) {
      console.error(`❌ Organization with slug "${orgSlug}" already exists: ${existingOrg.name}`);
      process.exit(1);
    }
    
    // Check if admin email already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', adminEmail)
      .single();
    
    if (existingUser) {
      console.error(`❌ User with email "${adminEmail}" already exists`);
      process.exit(1);
    }
    
    console.log('\n✅ Validation passed. Creating organization...');
    
    // Create organization
    const organizationData = {
      id: orgId,
      name: orgName,
      slug: orgSlug,
      domain: orgDomain || null,
      address: orgAddress || null,
      type: 'agency', // Based on existing data structure
      status: 'active',
      plan: subscriptionPlan,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const { data: newOrg, error: orgError } = await supabase
      .from('organizations')
      .insert(organizationData)
      .select()
      .single();
    
    if (orgError) {
      console.error('❌ Error creating organization:', orgError);
      process.exit(1);
    }
    
    console.log(`✅ Organization created: ${newOrg.name} (${newOrg.id})`);
    
    // Create admin user
    const userData = {
      id: uuidv4(),
      email: adminEmail,
      first_name: adminFirstName,
      last_name: adminLastName,
      phone: adminPhone || null,
      role: 'client_admin', // Using existing role from database
      organization_id: orgId,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert(userData)
      .select()
      .single();
    
    if (userError) {
      console.error('❌ Error creating admin user:', userError);
      // Cleanup: Delete the organization
      await supabase.from('organizations').delete().eq('id', orgId);
      process.exit(1);
    }
    
    console.log(`✅ Admin user created: ${newUser.email} (${newUser.id})`);
    
    // Success summary
    console.log('\n🎉 Client Organization Setup Complete!');
    console.log('═══════════════════════════════════════');
    console.log(`📋 Organization: ${newOrg.name}`);
    console.log(`🆔 Organization ID: ${newOrg.id}`);
    console.log(`🔗 Slug: ${newOrg.slug}`);
    console.log(`📧 Admin Email: ${newUser.email}`);
    console.log(`👤 Admin Name: ${newUser.first_name} ${newUser.last_name}`);
    console.log(`💼 Plan: ${newOrg.plan}`);
    console.log(`📅 Created: ${new Date().toLocaleString()}`);
    
    console.log('\n📝 Next Steps:');
    console.log('1. Send login credentials to the admin user');
    console.log('2. Set up Clerk authentication for the admin user');
    console.log('3. Configure any custom integrations');
    console.log('4. Test the organization setup');
    
    console.log('\n🔐 Login Information:');
    console.log(`   Email: ${adminEmail}`);
    console.log(`   They will need to sign up/login through Clerk`);
    console.log(`   Organization: ${orgName}`);
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Interactive mode
async function interactiveSetup() {
  const mode = await askQuestion('Setup Mode:\n1. Interactive Setup\n2. Quick Setup (with defaults)\n3. Exit\nChoose (1-3): ');
  
  switch (mode) {
    case '1':
      await setupClientOrganization();
      break;
    case '2':
      await quickSetup();
      break;
    case '3':
      console.log('👋 Goodbye!');
      process.exit(0);
      break;
    default:
      console.log('❌ Invalid choice');
      process.exit(1);
  }
}

async function quickSetup() {
  console.log('🚀 Quick Setup Mode');
  
  const orgName = await askQuestion('Organization Name: ');
  const adminEmail = await askQuestion('Admin Email: ');
  const adminFirstName = await askQuestion('Admin First Name: ');
  const adminLastName = await askQuestion('Admin Last Name: ');
  
  if (!orgName || !adminEmail || !adminFirstName || !adminLastName) {
    console.error('❌ Missing required information');
    process.exit(1);
  }
  
  // Use defaults for quick setup
  const orgId = uuidv4();
  const orgSlug = generateSlug(orgName);
  
  try {
    // Create organization
    const { data: newOrg, error: orgError } = await supabase
      .from('organizations')
      .insert({
        id: orgId,
        name: orgName,
        slug: orgSlug,
        type: 'agency',
        status: 'active',
        plan: 'starter',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (orgError) throw orgError;
    
    // Create admin user
    const { data: newUser, error: userError } = await supabase
      .from('users')
      .insert({
        id: uuidv4(),
        email: adminEmail,
        first_name: adminFirstName,
        last_name: adminLastName,
        role: 'client_admin',
        organization_id: orgId,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (userError) throw userError;
    
    console.log('✅ Quick setup complete!');
    console.log(`📋 Organization: ${newOrg.name} (${newOrg.id})`);
    console.log(`👤 Admin: ${newUser.first_name} ${newUser.last_name} (${newUser.email})`);
    
  } catch (error) {
    console.error('❌ Quick setup failed:', error);
    process.exit(1);
  }
}

// Command line arguments support
if (process.argv.length > 2) {
  const command = process.argv[2];
  
  switch (command) {
    case 'interactive':
      interactiveSetup();
      break;
    case 'quick':
      quickSetup();
      break;
    case 'help':
      console.log('Usage: node setup-client-organization.js [command]');
      console.log('Commands:');
      console.log('  interactive  - Interactive setup with full options');
      console.log('  quick        - Quick setup with minimal questions');
      console.log('  help         - Show this help message');
      process.exit(0);
      break;
    default:
      console.log('❌ Unknown command. Use "help" for usage information.');
      process.exit(1);
  }
} else {
  // Default to interactive mode
  interactiveSetup();
}

module.exports = { setupClientOrganization, quickSetup }; 