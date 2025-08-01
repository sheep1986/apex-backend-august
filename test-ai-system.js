const axios = require('axios');
require('dotenv').config();

async function testAIAnalysis() {
  console.log('🧪 Testing AI Call Analysis System\n');
  
  // Check if OpenAI key is configured
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('your-key-here')) {
    console.error('❌ OpenAI API key not configured in .env file');
    console.log('Please add: OPENAI_API_KEY=sk-your-actual-key');
    return;
  }
  
  console.log('✅ OpenAI API key found\n');
  
  // Sample webhook payload with realistic conversation
  const testPayload = {
    type: 'call-ended',
    call: {
      id: 'test-call-' + Date.now(),
      duration: 245, // 4 minutes
      cost: 0.25,
      startedAt: new Date(Date.now() - 245000).toISOString(),
      endedAt: new Date().toISOString(),
      endedReason: 'hangup',
      transcript: [
        { speaker: 'user', text: 'Hello?' },
        { speaker: 'ai', text: 'Hi! This is Sarah from Apex Solar Solutions. I\'m calling because you recently expressed interest in solar energy for your property. Do you have a few minutes to discuss how solar could help reduce your energy bills?' },
        { speaker: 'user', text: 'Oh yes, I did fill out a form online. We\'ve been thinking about solar for a while now.' },
        { speaker: 'ai', text: 'That\'s great to hear! May I ask your name?' },
        { speaker: 'user', text: 'Sure, I\'m Michael Johnson.' },
        { speaker: 'ai', text: 'Nice to meet you, Michael. Can you tell me what specifically got you interested in solar energy?' },
        { speaker: 'user', text: 'Well, our electricity bills have been crazy high lately. We\'re paying about $400 a month, and it just keeps going up. Plus, we want to do our part for the environment.' },
        { speaker: 'ai', text: 'I completely understand. $400 a month is significant. Many of our customers see their bills reduced by 70-90% after going solar. Are you the homeowner and decision maker for this type of investment?' },
        { speaker: 'user', text: 'Yes, my wife and I own the home. We\'d both need to be involved in the decision, but I usually handle the research on these things.' },
        { speaker: 'ai', text: 'Perfect. And how long have you been in your current home? Do you plan to stay there for the foreseeable future?' },
        { speaker: 'user', text: 'We\'ve been here about 5 years and definitely plan to stay. It\'s our forever home.' },
        { speaker: 'ai', text: 'That\'s ideal for solar. The long-term savings really add up. What\'s your approximate budget for a project like this, or are you more interested in our $0 down financing options?' },
        { speaker: 'user', text: 'We\'d probably need financing. We could maybe put down $5,000-10,000, but we\'d want to keep the monthly payments reasonable.' },
        { speaker: 'ai', text: 'That\'s very helpful to know. With that down payment, we can definitely create a plan where your monthly payment is less than what you\'re currently paying for electricity. Would you be interested in a free consultation where our specialist can assess your roof and provide exact numbers?' },
        { speaker: 'user', text: 'Yes, that sounds good. When could someone come out?' },
        { speaker: 'ai', text: 'Excellent! I have availability this Friday at 2 PM or Saturday at 10 AM. Which works better for you?' },
        { speaker: 'user', text: 'Friday at 2 PM would be perfect.' },
        { speaker: 'ai', text: 'Great! I\'ll schedule that for you. Can you confirm your address for me?' },
        { speaker: 'user', text: 'It\'s 1234 Sunshine Boulevard, San Diego, California, 92101.' },
        { speaker: 'ai', text: 'Perfect. And what\'s the best phone number to reach you at?' },
        { speaker: 'user', text: 'This number is fine - 555-123-4567.' },
        { speaker: 'ai', text: 'Excellent. I have you scheduled for Friday at 2 PM at 1234 Sunshine Boulevard. You\'ll receive a confirmation email shortly. Is there an email address I can send that to?' },
        { speaker: 'user', text: 'Yes, it\'s michael.johnson@email.com' },
        { speaker: 'ai', text: 'Perfect, Michael. You\'re all set for Friday at 2 PM. Our specialist will bring information about system sizing, pricing, and financing options. They\'ll also be able to show you exactly how much you could save. Do you have any other questions I can answer?' },
        { speaker: 'user', text: 'No, I think that covers it. Looking forward to Friday.' },
        { speaker: 'ai', text: 'Wonderful! We\'re looking forward to helping you save on energy costs. Have a great day, Michael!' },
        { speaker: 'user', text: 'Thanks, you too. Bye.' }
      ]
    }
  };
  
  try {
    console.log('📤 Sending test webhook to process call...');
    console.log('   Call ID:', testPayload.call.id);
    console.log('   Duration:', testPayload.call.duration, 'seconds');
    console.log('   Transcript length:', testPayload.call.transcript.length, 'turns\n');
    
    const webhookResponse = await axios.post('http://localhost:3001/api/vapi/webhook', testPayload, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log('✅ Webhook accepted:', webhookResponse.data);
    
    // Wait for processing
    console.log('\n⏳ Waiting 10 seconds for AI processing...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Process the queue
    console.log('\n📊 Triggering queue processing...');
    try {
      const queueResponse = await axios.get('http://localhost:3001/api/vapi/process-queue');
      console.log('Queue processing result:', queueResponse.data);
    } catch (queueError) {
      console.log('Queue endpoint not available, checking manual analysis...');
    }
    
    // Try manual analysis as backup
    console.log('\n🔍 Attempting manual analysis...');
    try {
      // First, we need to get the actual call ID from the database
      // For this test, we'll use the test ID directly
      const manualResponse = await axios.post(
        `http://localhost:3001/api/vapi/analyze/${testPayload.call.id}`,
        {},
        { timeout: 30000 } // 30 second timeout for AI processing
      );
      
      console.log('\n✅ AI Analysis Complete!\n');
      console.log('📊 Analysis Results:');
      console.log('   Interest Level:', manualResponse.data.analysis.interestLevel + '%');
      console.log('   Sentiment:', manualResponse.data.analysis.sentiment);
      console.log('   Decision Maker:', manualResponse.data.analysis.decisionMaker ? 'Yes' : 'No');
      console.log('\n👤 Extracted Contact:');
      console.log('   Name:', manualResponse.data.analysis.contactInfo.name);
      console.log('   Email:', manualResponse.data.analysis.contactInfo.email);
      console.log('   Phone:', manualResponse.data.analysis.contactInfo.phone);
      console.log('   Address:', manualResponse.data.analysis.contactInfo.address);
      console.log('\n📅 Appointment Request:');
      console.log('   Requested:', manualResponse.data.analysis.appointmentRequest?.requested ? 'Yes' : 'No');
      if (manualResponse.data.analysis.appointmentRequest?.requested) {
        console.log('   Date:', manualResponse.data.analysis.appointmentRequest.date);
        console.log('   Time:', manualResponse.data.analysis.appointmentRequest.time);
      }
      console.log('\n💰 Qualification:');
      console.log('   Budget:', manualResponse.data.analysis.budget || 'Not specified');
      console.log('   Timeline:', manualResponse.data.analysis.timeline || 'Not specified');
      console.log('\n📝 Summary:');
      console.log('   ', manualResponse.data.analysis.summary);
      
      if (manualResponse.data.result) {
        console.log('\n✅ Actions Taken:');
        manualResponse.data.result.actions.forEach(action => {
          console.log('   -', action);
        });
      }
      
    } catch (analysisError) {
      console.error('❌ Analysis failed:', analysisError.response?.data || analysisError.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    console.log('\n💡 Make sure the backend server is running: npm run dev');
  }
}

// Run the test
console.log('🚀 Starting AI Call Analysis Test\n');
console.log('This test will:');
console.log('1. Send a realistic call transcript to the webhook');
console.log('2. Trigger AI analysis using GPT-4');
console.log('3. Extract contact info, appointment request, and qualification data');
console.log('4. Show the results\n');

testAIAnalysis();