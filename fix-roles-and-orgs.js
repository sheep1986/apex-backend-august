const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixRolesAndOrganizations() {
  try {
    console.log('🔧 Fixing roles and organizations...\n');
    
    // 1. Check existing organizations
    console.log('📋 Checking existing organizations...');
    const { data: existingOrgs, error: orgsError } = await supabase
      .from('organizations')
      .select('*');
    
    if (orgsError) {
      console.error('❌ Error fetching organizations:', orgsError);
      return;
    }
    
    console.log(`✅ Found ${existingOrgs.length} existing organizations:`);
    existingOrgs.forEach(org => {
      console.log(`  - ${org.name} (${org.id}) - ${org.type} - ${org.status}`);
    });
    
    // 2. Create default organizations if they don't exist
    const defaultOrgs = [
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Apex Platform Team',
        slug: 'apex-platform',
        type: 'platform',
        status: 'active',
        plan: 'enterprise'
      },
      {
        id: '660e8400-e29b-41d4-a716-446655440001',
        name: 'Artificial Media',
        slug: 'artificial-media',
        type: 'client',
        status: 'active',
        plan: 'growth'
      }
    ];
    
    for (const org of defaultOrgs) {
      const existingOrg = existingOrgs.find(o => o.id === org.id || o.slug === org.slug);
      
      if (!existingOrg) {
        console.log(`➕ Creating organization: ${org.name}`);
        const { data: newOrg, error: createError } = await supabase
          .from('organizations')
          .insert(org)
          .select()
          .single();
        
        if (createError) {
          console.error(`❌ Error creating ${org.name}:`, createError);
        } else {
          console.log(`✅ Created organization: ${newOrg.name} (${newOrg.id})`);
        }
      } else {
        console.log(`✅ Organization already exists: ${existingOrg.name}`);
      }
    }
    
    // 3. Test user creation with different roles
    console.log('\n🧪 Testing user creation with various roles...');
    
    const testRoles = [
      'platform_owner',
      'agency_admin', 
      'agency_user',
      'client_admin',
      'client_user'
    ];
    
    const testOrgId = '550e8400-e29b-41d4-a716-446655440000'; // Apex Platform Team
    
    for (const role of testRoles) {
      console.log(`\n🧪 Testing role: ${role}`);
      
      const testUser = {
        email: `test-${role}@example.com`,
        first_name: 'Test',
        last_name: role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
        role: role,
        organization_id: testOrgId,
        status: 'active'
      };
      
      const { data: userData, error: userError } = await supabase
        .from('users')
        .insert(testUser)
        .select()
        .single();
      
      if (userError) {
        console.error(`❌ Failed to create user with role ${role}:`, userError.message);
        
        // If it's a role constraint error, let's check what roles are allowed
        if (userError.code === '23514') {
          console.log('🔍 This appears to be a role constraint violation');
        }
      } else {
        console.log(`✅ Successfully created user with role: ${role}`);
        
        // Clean up test user
        await supabase.from('users').delete().eq('id', userData.id);
        console.log('🧹 Test user cleaned up');
      }
    }
    
    // 4. Check current users
    console.log('\n📋 Checking existing users...');
    const { data: existingUsers, error: usersError } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, role, organization_id, status')
      .limit(10);
    
    if (usersError) {
      console.error('❌ Error fetching users:', usersError);
    } else {
      console.log(`✅ Found ${existingUsers.length} existing users:`);
      existingUsers.forEach(user => {
        console.log(`  - ${user.email} (${user.role}) - Org: ${user.organization_id}`);
      });
    }
    
    // 5. Create a platform owner if none exists
    const platformOwners = existingUsers.filter(u => u.role === 'platform_owner');
    
    if (platformOwners.length === 0) {
      console.log('\n➕ Creating platform owner user...');
      
      const platformOwner = {
        email: 'sean@apex.ai',
        first_name: 'Sean',
        last_name: 'Wentz',
        role: 'platform_owner',
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'active'
      };
      
      const { data: ownerData, error: ownerError } = await supabase
        .from('users')
        .insert(platformOwner)
        .select()
        .single();
      
      if (ownerError) {
        console.error('❌ Error creating platform owner:', ownerError);
      } else {
        console.log('✅ Platform owner created successfully:', ownerData.email);
      }
    } else {
      console.log(`✅ Platform owner already exists: ${platformOwners[0].email}`);
    }
    
  } catch (error) {
    console.error('❌ Error in fix process:', error);
  }
}

// Run the fix
if (require.main === module) {
  fixRolesAndOrganizations()
    .then(() => {
      console.log('\n🎉 Roles and organizations fix completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Fix process failed:', error);
      process.exit(1);
    });
}

module.exports = { fixRolesAndOrganizations }; 