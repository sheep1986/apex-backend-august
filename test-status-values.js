require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testAllStatuses() {
  const testStatuses = [
    // Common call statuses
    'initiated', 'ringing', 'answered', 'completed', 'ended', 'failed',
    'busy', 'no_answer', 'canceled', 'missed', 'declined',
    // Underscored versions
    'in_progress', 'no_answer', 'call_ended', 'call_failed',
    // VAPI specific statuses (common ones)
    'queued', 'active', 'inactive', 'terminated'
  ];
  
  console.log('🧪 Testing all possible status values...');
  const validStatuses = [];
  
  for (const status of testStatuses) {
    try {
      const testRecord = {
        organization_id: '47a8e3ea-cd34-4746-a786-dd31e8f8105e',
        campaign_id: '40bf78e3-391c-4396-b61f-ab7e628ba330', 
        lead_id: '3df3ea35-053a-4ec2-8c79-38b11983cc87',
        status: status,
        direction: 'outbound',
        phone_number: '+447526126716',
        started_at: new Date().toISOString()
      };
      
      const { data, error } = await supabase
        .from('calls')
        .insert(testRecord)
        .select()
        .single();
        
      if (!error && data) {
        console.log(`✅ '${status}' - VALID`);
        validStatuses.push(status);
        
        // Clean up
        await supabase.from('calls').delete().eq('id', data.id);
      } else {
        console.log(`❌ '${status}' - ${error.message}`);
      }
    } catch (err) {
      console.log(`❌ '${status}' - Exception: ${err.message}`);
    }
  }
  
  console.log('\n📋 Summary of VALID status values:');
  validStatuses.forEach(status => console.log(`  - ${status}`));
}

testAllStatuses().catch(console.error); 