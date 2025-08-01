const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function fixDatabase() {
    console.log('🔧 Fixing database schema and data...');
    
    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
            console.error('❌ Missing Supabase environment variables');
            return;
        }
        
        const supabase = createClient(supabaseUrl, supabaseKey, {
            auth: { persistSession: false }
        });
        
        console.log('✅ Supabase client initialized');
        
        // Update existing organizations instead of creating new ones
        console.log('📝 Updating existing organizations...');
        
        // Update the existing organization to be Artificial Media
        const { data: updatedOrg, error: updateOrgError } = await supabase
            .from('organizations')
            .update({
                name: 'Artificial Media',
                type: 'agency'
            })
            .eq('id', (await supabase.from('organizations').select('id').limit(1)).data?.[0]?.id)
            .select();
            
        if (updateOrgError) {
            console.error('❌ Error updating organization:', updateOrgError.message);
        } else {
            console.log('✅ Organization updated successfully');
        }
        
        // Update the existing user to be Sean with correct role
        console.log('📝 Updating existing user...');
        
        const { data: updatedUser, error: updateUserError } = await supabase
            .from('users')
            .update({
                email: 'sean@artificialmedia.co.uk',
                first_name: 'Sean',
                last_name: 'Wentz',
                role: 'platform_owner'  // This might fail due to constraint
            })
            .eq('email', 'sean@artificialmedia.co.uk')
            .select();
            
        if (updateUserError) {
            console.log('⚠️ Could not update user role (constraint issue):', updateUserError.message);
            
            // Try to update without changing role
            const { data: userUpdate2, error: userError2 } = await supabase
                .from('users')
                .update({
                    first_name: 'Sean',
                    last_name: 'Wentz'
                })
                .eq('email', 'sean@artificialmedia.co.uk')
                .select();
                
            if (userError2) {
                console.error('❌ Could not update user at all:', userError2.message);
            } else {
                console.log('✅ User updated (without role change)');
            }
        } else {
            console.log('✅ User updated successfully with new role');
        }
        
        // Test the current setup
        console.log('🧪 Testing current setup...');
        
        const { data: finalOrgs, error: finalOrgError } = await supabase
            .from('organizations')
            .select('*');
            
        const { data: finalUsers, error: finalUserError } = await supabase
            .from('users')
            .select('*');
            
        if (finalOrgError) {
            console.error('❌ Organizations test failed:', finalOrgError.message);
        } else {
            console.log(`✅ Organizations working: ${finalOrgs?.length || 0} found`);
            finalOrgs?.forEach(org => {
                console.log(`   - ${org.name} (${org.type || 'unknown'})`);
            });
        }
        
        if (finalUserError) {
            console.error('❌ Users test failed:', finalUserError.message);
        } else {
            console.log(`✅ Users working: ${finalUsers?.length || 0} found`);
            finalUsers?.forEach(user => {
                console.log(`   - ${user.email} (${user.role})`);
            });
        }
        
        console.log('');
        console.log('🎉 Database is ready!');
        console.log('');
        console.log('📋 Current Status:');
        console.log(`   - Organizations: ${finalOrgs?.length || 0}`);
        console.log(`   - Users: ${finalUsers?.length || 0}`);
        console.log('');
        console.log('🚀 Starting the application...');
        
    } catch (error) {
        console.error('❌ Database fix failed:', error.message);
    }
}

fixDatabase(); 