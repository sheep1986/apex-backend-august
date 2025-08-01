const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function createSampleCalls() {
  try {
    console.log('🔍 Creating sample calls...');
    
    // Get existing organizations and leads
    const { data: organizations } = await supabase
      .from('organizations')
      .select('id')
      .limit(3);
    
    const { data: leads } = await supabase
      .from('leads')
      .select('id')
      .limit(5);
    
    if (!organizations || organizations.length === 0) {
      console.log('⚠️  No organizations found. Cannot create calls.');
      return;
    }

    console.log('📋 Found', organizations.length, 'organizations and', leads?.length || 0, 'leads');

    const sampleCalls = [
      {
        organization_id: organizations[0].id,
        vapi_call_id: 'sample-call-1',
        lead_id: leads?.[0]?.id || null,
        phone_number: '+1234567890',
        direction: 'outbound',
        status: 'completed',
        duration: 180,
        cost: 0.25,
        started_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        ended_at: new Date(Date.now() - 2 * 60 * 60 * 1000 + 180 * 1000).toISOString(), // 2 hours ago + 3 min
        end_reason: 'completed',
        sentiment_score: 0.8,
        summary: 'Successful connection, interested in services'
      },
      {
        organization_id: organizations[0].id,
        vapi_call_id: 'sample-call-2',
        lead_id: leads?.[1]?.id || null,
        phone_number: '+1234567891',
        direction: 'outbound',
        status: 'completed',
        duration: 45,
        cost: 0.10,
        started_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
        ended_at: new Date(Date.now() - 4 * 60 * 60 * 1000 + 45 * 1000).toISOString(), // 4 hours ago + 45 sec
        end_reason: 'voicemail',
        sentiment_score: 0.5,
        summary: 'Left voicemail message'
      },
      {
        organization_id: organizations[0].id,
        vapi_call_id: 'sample-call-3',
        lead_id: leads?.[2]?.id || null,
        phone_number: '+1234567892',
        direction: 'outbound',
        status: 'completed',
        duration: 320,
        cost: 0.45,
        started_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
        ended_at: new Date(Date.now() - 6 * 60 * 60 * 1000 + 320 * 1000).toISOString(), // 6 hours ago + 5.33 min
        end_reason: 'completed',
        sentiment_score: 0.9,
        summary: 'Very interested, scheduled follow-up'
      },
      {
        organization_id: organizations[0].id,
        vapi_call_id: 'sample-call-4',
        lead_id: leads?.[3]?.id || null,
        phone_number: '+1234567893',
        direction: 'outbound',
        status: 'completed',
        duration: 0,
        cost: 0.05,
        started_at: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(), // 8 hours ago
        ended_at: new Date(Date.now() - 8 * 60 * 60 * 1000 + 1000).toISOString(), // 8 hours ago + 1 sec
        end_reason: 'no_answer',
        sentiment_score: 0.5,
        summary: 'No answer, will retry later'
      },
      {
        organization_id: organizations[0].id,
        vapi_call_id: 'sample-call-5',
        lead_id: leads?.[4]?.id || null,
        phone_number: '+1234567894',
        direction: 'outbound',
        status: 'completed',
        duration: 95,
        cost: 0.15,
        started_at: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(), // 10 hours ago
        ended_at: new Date(Date.now() - 10 * 60 * 60 * 1000 + 95 * 1000).toISOString(), // 10 hours ago + 1.5 min
        end_reason: 'completed',
        sentiment_score: 0.2,
        summary: 'Not interested in services'
      }
    ];

    // Insert sample calls
    const { data, error } = await supabase
      .from('calls')
      .insert(sampleCalls)
      .select('*');

    if (error) {
      console.error('❌ Error creating sample calls:', error);
      return;
    }

    console.log('✅ Created', data.length, 'sample calls');
    console.log('Sample call:', JSON.stringify(data[0], null, 2));

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

createSampleCalls(); 