const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function createBasicData() {
  try {
    console.log('🔄 Creating basic sample data...');
    
    // 1. Create sample organizations with basic fields
    console.log('📋 Creating organizations...');
    const organizations = [
      {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Acme Corporation',
        slug: 'acme-corp',
        type: 'client',
        status: 'active',
        primary_color: '#3B82F6',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440001', 
        name: 'TechStart Inc',
        slug: 'techstart-inc',
        type: 'client',
        status: 'active',
        primary_color: '#10B981',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        name: 'Global Solutions',
        slug: 'global-solutions',
        type: 'client',
        status: 'active',
        primary_color: '#8B5CF6',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .insert(organizations)
      .select('*');

    if (orgError) {
      console.error('❌ Error creating organizations:', orgError);
      return;
    }

    console.log('✅ Created', orgData.length, 'organizations');

    // 2. Create sample users
    console.log('📋 Creating users...');
    const users = [
      {
        id: '358b6fd9-ec05-4d95-b00d-2666041473bd',
        email: 'sean@artificialmedia.co.uk',
        first_name: 'Sean',
        last_name: 'Wentz',
        role: 'platform_owner',
        status: 'active',
        organization_id: organizations[0].id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '919004cd-19a8-4d10-a501-2bf59a581823',
        email: 'john@acmecorp.com',
        first_name: 'John',
        last_name: 'Smith',
        role: 'client_admin',
        status: 'active',
        organization_id: organizations[0].id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: '8faaa97f-e6de-4f3a-9c1e-ee264db72104',
        email: 'sarah@techstart.com',
        first_name: 'Sarah',
        last_name: 'Johnson',
        role: 'client_admin',
        status: 'active',
        organization_id: organizations[1].id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    const { data: userData, error: userError } = await supabase
      .from('users')
      .insert(users)
      .select('*');

    if (userError) {
      console.error('❌ Error creating users:', userError);
      return;
    }

    console.log('✅ Created', userData.length, 'users');

    // 3. Create sample leads
    console.log('📋 Creating leads...');
    const leads = [
      {
        organization_id: organizations[0].id,
        first_name: 'John',
        last_name: 'Smith',
        email: 'john.smith@techcorp.com',
        phone: '+1-555-0101',
        company: 'TechCorp Solutions',
        job_title: 'CTO',
        lead_quality: 'high',
        qualification_status: 'qualified',
        lead_source: 'website',
        score: 85,
        call_status: 'scheduled',
        phone_validated: true,
        email_validated: true,
        data_quality_score: 95,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        organization_id: organizations[0].id,
        first_name: 'Sarah',
        last_name: 'Johnson',
        email: 'sarah.johnson@healthcare.com',
        phone: '+1-555-0102',
        company: 'Healthcare Innovations',
        job_title: 'VP of Operations',
        lead_quality: 'medium',
        qualification_status: 'contacted',
        lead_source: 'referral',
        score: 72,
        call_status: 'completed',
        phone_validated: true,
        email_validated: true,
        data_quality_score: 88,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        organization_id: organizations[1].id,
        first_name: 'Mike',
        last_name: 'Davis',
        email: 'mike.davis@techstart.com',
        phone: '+1-555-0103',
        company: 'TechStart Innovations',
        job_title: 'Founder',
        lead_quality: 'high',
        qualification_status: 'qualified',
        lead_source: 'linkedin',
        score: 92,
        call_status: 'scheduled',
        phone_validated: true,
        email_validated: true,
        data_quality_score: 92,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        organization_id: organizations[1].id,
        first_name: 'Emily',
        last_name: 'Chen',
        email: 'emily.chen@consulting.com',
        phone: '+1-555-0104',
        company: 'Strategic Consulting Group',
        job_title: 'Senior Consultant',
        lead_quality: 'medium',
        qualification_status: 'new',
        lead_source: 'cold_email',
        score: 68,
        call_status: 'pending',
        phone_validated: false,
        email_validated: true,
        data_quality_score: 75,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        organization_id: organizations[2].id,
        first_name: 'David',
        last_name: 'Rodriguez',
        email: 'david.rodriguez@realestate.com',
        phone: '+1-555-0105',
        company: 'Prime Real Estate',
        job_title: 'Managing Director',
        lead_quality: 'high',
        qualification_status: 'qualified',
        lead_source: 'referral',
        score: 89,
        call_status: 'completed',
        phone_validated: true,
        email_validated: true,
        data_quality_score: 91,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    const { data: leadData, error: leadError } = await supabase
      .from('leads')
      .insert(leads)
      .select('*');

    if (leadError) {
      console.error('❌ Error creating leads:', leadError);
      return;
    }

    console.log('✅ Created', leadData.length, 'leads');

    console.log('\n🎉 Basic sample data created successfully!');
    console.log('📊 Summary:');
    console.log(`  - Organizations: ${orgData.length}`);
    console.log(`  - Users: ${userData.length}`);
    console.log(`  - Leads: ${leadData.length}`);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

createBasicData(); 