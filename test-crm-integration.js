require('dotenv').config();

async function testCRMIntegration() {
  console.log('🧪 Testing CRM Integration...');
  
  // Simulate a qualified call webhook
  const testCallData = {
    campaign_id: 'b1e2c1fc-82db-446b-a426-0b6ed0610c4a', // Real campaign ID: Welcome Campaign
    phone_number: '+1234567890',
    contact_name: 'John Smith',
    vapi_call_id: 'test-call-' + Date.now(),
    call_started_at: new Date().toISOString(),
    call_ended_at: new Date(Date.now() + 120000).toISOString(), // 2 minutes later
    duration_seconds: 120,
    outcome: 'qualified',
    ai_sentiment_score: 0.8,
    ai_qualification_score: 0.9,
    ai_summary: 'Customer expressed strong interest in our AI calling solution. Mentioned they need to improve their lead generation and are currently using outdated manual processes. Budget range appears to be $1000-5000/month. Decision maker is the Marketing Director.',
    ai_next_action: 'Schedule demo call with technical team to show platform capabilities',
    call_cost_usd: 0.15
  };

  try {
    console.log('📞 Sending test call data to webhook...');
    
    const response = await fetch('http://localhost:3001/api/call-attempts', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer sean-dev-token',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testCallData)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Call attempt created successfully');
      console.log('📋 Result:', JSON.stringify(result, null, 2));
    } else {
      console.log('❌ Failed to create call attempt');
      console.log('📋 Error:', JSON.stringify(result, null, 2));
    }

  } catch (error) {
    console.log('❌ Network error:', error.message);
  }
}

testCRMIntegration();