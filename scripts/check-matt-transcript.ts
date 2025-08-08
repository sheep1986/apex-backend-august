import supabase from '../services/supabase-client';

async function checkMattsCalls() {
  console.log('🔍 Checking Matt\'s actual call transcripts...\n');
  
  try {
    // Find calls for Matt's phone number
    const { data: calls, error } = await supabase
      .from('calls')
      .select('*')
      .eq('customer_phone', '+35677161714')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching calls:', error);
      return;
    }
    
    if (!calls || calls.length === 0) {
      console.log('No calls found for Matt');
      return;
    }
    
    console.log(`📞 Found ${calls.length} call(s) for Matt\n`);
    
    for (const call of calls) {
      console.log('=' .repeat(80));
      console.log(`Call ID: ${call.id}`);
      console.log(`Date: ${call.created_at}`);
      console.log(`Duration: ${call.duration} seconds`);
      console.log(`Outcome: ${call.outcome}`);
      console.log(`Has transcript: ${!!call.transcript}`);
      console.log(`Has summary: ${!!call.summary}`);
      
      if (call.transcript) {
        console.log('\n📝 FULL TRANSCRIPT:');
        console.log('-'.repeat(40));
        console.log(call.transcript);
        console.log('-'.repeat(40));
        console.log(`\nTranscript length: ${call.transcript.length} characters`);
      }
      
      if (call.summary) {
        console.log('\n📊 SUMMARY:');
        console.log(call.summary);
      }
      
      if (call.key_points) {
        console.log('\n🎯 KEY POINTS:');
        console.log(call.key_points);
      }
      
      if (call.contact_info) {
        console.log('\n📧 EXTRACTED CONTACT INFO:');
        console.log(JSON.stringify(call.contact_info, null, 2));
      }
      
      if (call.qualification_details) {
        console.log('\n💡 QUALIFICATION DETAILS:');
        console.log(JSON.stringify(call.qualification_details, null, 2));
      }
      
      if (call.customer_email || call.customer_company || call.address) {
        console.log('\n📍 STORED INFORMATION:');
        if (call.customer_email) console.log(`  Email: ${call.customer_email}`);
        if (call.customer_company) console.log(`  Company: ${call.customer_company}`);
        if (call.address) console.log(`  Address: ${call.address}`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkMattsCalls().then(() => process.exit(0));