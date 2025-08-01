const { supabaseService } = require('./services/supabase-client');

async function checkCalls() {
  try {
    console.log('🔍 Checking recent calls...');
    const { data: calls, error } = await supabaseService.from('calls').select('*').order('created_at', { ascending: false }).limit(3);
    
    if (error) {
      console.error('❌ Error:', error);
      return;
    }
    
    console.log('📞 Recent calls:');
    calls.forEach((call, index) => {
      console.log(`\n${index + 1}. Call ID: ${call.id}`);
      console.log(`   VAPI Call ID: ${call.vapi_call_id}`);
      console.log(`   Status: ${call.status}`);
      console.log(`   Phone: ${call.phone_number}`);
      console.log(`   Created: ${call.created_at}`);
      console.log(`   Lead ID: ${call.lead_id}`);
      console.log(`   Campaign ID: ${call.campaign_id}`);
    });
  } catch (error) {
    console.error('❌ Error checking calls:', error);
  }
}

checkCalls(); 