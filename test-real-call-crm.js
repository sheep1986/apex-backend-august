require('dotenv').config();

async function testRealCallCRM() {
  console.log('🧪 Testing CRM Integration with Real Call Data...');
  
  // Get a real call ID from the database first
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('🔍 Finding a real call to promote...');
  const { data: calls, error } = await supabase
    .from('calls')
    .select('id, phone_number, customer_name, campaign_id')
    .limit(1);

  if (error || !calls || calls.length === 0) {
    console.log('❌ No calls found to test with');
    return;
  }

  const testCall = calls[0];
  console.log(`📞 Found call: ${testCall.customer_name} (${testCall.phone_number})`);
  console.log(`📋 Call ID: ${testCall.id}`);

  try {
    console.log('🚀 Promoting call to CRM...');
    
    const response = await fetch(`http://localhost:3001/api/calls/${testCall.id}/promote-to-crm`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer sean-dev-token',
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Call promoted to CRM successfully!');
      console.log('📋 Result:', JSON.stringify(result, null, 2));
      
      // Verify CRM contact was created
      console.log('\n🔍 Verifying CRM contact was created...');
      const { data: crmContacts } = await supabase
        .from('leads')
        .select('*')
        .eq('phone', testCall.phone_number);
      
      if (crmContacts && crmContacts.length > 0) {
        console.log('✅ CRM Contact found in database:');
        console.log(`   Name: ${crmContacts[0].first_name} ${crmContacts[0].last_name}`);
        console.log(`   Phone: ${crmContacts[0].phone}`);
        console.log(`   Status: ${crmContacts[0].qualification_status}`);
        console.log(`   Score: ${crmContacts[0].score}`);
        console.log(`   Source: ${crmContacts[0].lead_source}`);
      } else {
        console.log('❌ CRM contact not found in database');
      }
      
    } else {
      console.log('❌ Failed to promote call to CRM');
      console.log('📋 Error:', JSON.stringify(result, null, 2));
    }

  } catch (error) {
    console.log('❌ Network error:', error.message);
  }
}

testRealCallCRM();