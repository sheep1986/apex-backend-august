require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCallsTable() {
  console.log('🔍 Checking calls table structure...');
  
  // Get existing calls to see structure
  const { data: existingCalls, error: existingError } = await supabase
    .from('calls')
    .select('*')
    .limit(5);
    
  if (existingCalls && existingCalls.length > 0) {
    console.log('📊 Existing call columns:', Object.keys(existingCalls[0]));
    console.log('📋 Sample call:', existingCalls[0]);
  } else {
    console.log('📋 No existing calls found');
  }
  
  // Test status values one by one
  const testStatuses = [
    'pending', 'active', 'completed', 'failed', 
    'in-progress', 'ended', 'queued', 'busy', 
    'no-answer', 'ringing', 'answered', 'canceled'
  ];
  
  console.log('🧪 Testing status values...');
  
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
        console.log(`✅ Status '${status}' is VALID`);
        
        // Clean up - delete the test record
        await supabase
          .from('calls')
          .delete()
          .eq('id', data.id);
          
        break; // Found a valid status, stop testing
      } else {
        console.log(`❌ Status '${status}' failed:`, error?.message || 'Unknown error');
      }
    } catch (err) {
      console.log(`❌ Status '${status}' exception:`, err.message);
    }
  }
}

checkCallsTable().catch(console.error); 