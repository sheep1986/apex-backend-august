const axios = require('axios');
require('dotenv').config();

async function testB2BCall() {
  console.log('\n🏢 Testing B2B Call Analysis\n');
  
  const b2bPayload = {
    type: 'call-ended',
    call: {
      id: 'test-b2b-' + Date.now(),
      duration: 320,
      cost: 0.35,
      transcript: [
        { speaker: 'user', text: 'Hello, this is John from ABC Manufacturing.' },
        { speaker: 'ai', text: 'Hi John! Thanks for taking my call. I understand ABC Manufacturing is looking into automation solutions. Is that correct?' },
        { speaker: 'user', text: 'Yes, we\'re exploring options. Our production line is getting overwhelmed.' },
        { speaker: 'ai', text: 'I see. Can you tell me about your current production volume and what specific challenges you\'re facing?' },
        { speaker: 'user', text: 'We produce about 10,000 units per day across 3 shifts. The main issue is quality control - we have too many defects slipping through.' },
        { speaker: 'ai', text: 'That\'s a significant volume. How many employees are currently handling quality control?' },
        { speaker: 'user', text: 'We have about 15 people dedicated to QC, but it\'s not enough. We\'re a mid-size company with about 200 employees total.' },
        { speaker: 'ai', text: 'I understand. Our AI-powered inspection systems have helped similar manufacturers reduce defects by 85%. What\'s your budget range for a solution like this?' },
        { speaker: 'user', text: 'We\'ve allocated around $200,000 for automation improvements this fiscal year.' },
        { speaker: 'ai', text: 'That\'s definitely within range for our solutions. Are you the primary decision maker for this, or are others involved?' },
        { speaker: 'user', text: 'I\'m the VP of Operations, so I make the recommendation, but our CEO and CFO need to sign off on anything over $100k.' },
        { speaker: 'ai', text: 'Makes sense. Would you be interested in a demonstration where we can show you exactly how our system would work with your production line?' },
        { speaker: 'user', text: 'Yes, that would be helpful. When could you do that?' },
        { speaker: 'ai', text: 'I have availability next Tuesday at 2 PM or Thursday at 10 AM. Which works better for your team?' },
        { speaker: 'user', text: 'Tuesday at 2 PM works. Can you send the invite to john.smith@abcmanufacturing.com?' },
        { speaker: 'ai', text: 'Absolutely! I\'ll send a calendar invite to that email. What\'s the best number to reach you if needed?' },
        { speaker: 'user', text: 'My direct line is 555-0123.' }
      ]
    }
  };
  
  try {
    const response = await axios.post('http://localhost:3001/api/vapi/webhook', b2bPayload);
    console.log('✅ B2B webhook accepted');
    return b2bPayload.call.id;
  } catch (error) {
    console.error('❌ B2B test failed:', error.message);
    return null;
  }
}

async function testB2CCall() {
  console.log('\n🏠 Testing B2C Call Analysis\n');
  
  const b2cPayload = {
    type: 'call-ended',
    call: {
      id: 'test-b2c-' + Date.now(),
      duration: 280,
      cost: 0.30,
      transcript: [
        { speaker: 'user', text: 'Hello?' },
        { speaker: 'ai', text: 'Hi! This is Emma from Solar Savings Solutions. I\'m calling because you expressed interest in reducing your home energy bills. Do you have a few minutes?' },
        { speaker: 'user', text: 'Oh yes, I did fill out that form. We\'re tired of these high electricity bills.' },
        { speaker: 'ai', text: 'I completely understand. May I get your name?' },
        { speaker: 'user', text: 'I\'m Sarah Johnson.' },
        { speaker: 'ai', text: 'Nice to meet you, Sarah. Can you tell me about your current energy bills?' },
        { speaker: 'user', text: 'We\'re paying about $350 a month, and it\'s killing us. We have a large house, about 3,500 square feet.' },
        { speaker: 'ai', text: 'That is quite high. Do you own your home?' },
        { speaker: 'user', text: 'Yes, we\'ve owned it for about 8 years now. It\'s our forever home.' },
        { speaker: 'ai', text: 'Perfect! Solar is ideal for homeowners planning to stay long-term. Is it just you, or do you have a family?' },
        { speaker: 'user', text: 'It\'s me, my husband, and our three kids. So yeah, we use a lot of electricity!' },
        { speaker: 'ai', text: 'I can imagine! With a family of five, solar could really make a difference. What\'s your main motivation for considering solar?' },
        { speaker: 'user', text: 'Honestly, it\'s the cost savings. But we also want to do our part for the environment, teach the kids about being green.' },
        { speaker: 'ai', text: 'That\'s wonderful. Many of our customers save 70-90% on their bills. Would you be interested in a free consultation to see exactly how much you could save?' },
        { speaker: 'user', text: 'Yes, definitely. When could someone come out?' },
        { speaker: 'ai', text: 'I have this Saturday at 10 AM or Sunday at 2 PM available. Which works better for you?' },
        { speaker: 'user', text: 'Saturday morning would be perfect.' },
        { speaker: 'ai', text: 'Great! Can you confirm your address for me?' },
        { speaker: 'user', text: 'It\'s 456 Oak Street, Pleasantville, CA 90210.' },
        { speaker: 'ai', text: 'Perfect! And is this the best number to reach you - the one you\'re calling from?' },
        { speaker: 'user', text: 'Yes, this is my cell - 555-9876.' }
      ]
    }
  };
  
  try {
    const response = await axios.post('http://localhost:3001/api/vapi/webhook', b2cPayload);
    console.log('✅ B2C webhook accepted');
    return b2cPayload.call.id;
  } catch (error) {
    console.error('❌ B2C test failed:', error.message);
    return null;
  }
}

async function analyzeResults(callId, type) {
  console.log(`\n📊 Analyzing ${type} results...`);
  
  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 8000));
  
  try {
    const response = await axios.post(
      `http://localhost:3001/api/vapi/analyze/${callId}`,
      {},
      { timeout: 30000 }
    );
    
    const analysis = response.data.analysis;
    
    console.log(`\n✅ ${type} Analysis Complete:`);
    console.log('   Lead Type:', analysis.leadType);
    console.log('   Interest Level:', analysis.interestLevel + '%');
    console.log('   Decision Maker:', analysis.decisionMaker);
    
    console.log('\n👤 Contact Info:');
    console.log('   Name:', analysis.contactInfo.name);
    console.log('   Email:', analysis.contactInfo.email);
    console.log('   Phone:', analysis.contactInfo.phone);
    if (analysis.leadType === 'b2b') {
      console.log('   Company:', analysis.contactInfo.company);
      console.log('   Title:', analysis.contactInfo.title);
    }
    
    if (analysis.businessContext && analysis.leadType === 'b2b') {
      console.log('\n🏢 Business Context:');
      console.log('   Industry:', analysis.businessContext.industry);
      console.log('   Employee Count:', analysis.businessContext.employeeCount);
      console.log('   Current Solution:', analysis.businessContext.currentSolution);
      console.log('   Decision Process:', analysis.businessContext.decisionProcess);
    }
    
    if (analysis.consumerContext && analysis.leadType === 'b2c') {
      console.log('\n🏠 Consumer Context:');
      console.log('   Property Type:', analysis.consumerContext.propertyType);
      console.log('   Ownership:', analysis.consumerContext.ownership);
      console.log('   Household:', analysis.consumerContext.household);
      console.log('   Motivation:', analysis.consumerContext.motivation);
    }
    
    console.log('\n💰 Qualification:');
    console.log('   Budget:', analysis.budget);
    console.log('   Timeline:', analysis.timeline);
    
    if (analysis.appointmentRequest?.requested) {
      console.log('\n📅 Appointment:', 'Yes -', analysis.appointmentRequest.date, analysis.appointmentRequest.time);
    }
    
  } catch (error) {
    console.error(`❌ Failed to analyze ${type}:`, error.message);
  }
}

async function runTests() {
  console.log('🧪 AI B2B/B2C Lead Detection Test\n');
  console.log('This test will:');
  console.log('1. Send a B2B call transcript (manufacturing company)');
  console.log('2. Send a B2C call transcript (residential solar)');
  console.log('3. Show how AI detects and handles each type differently\n');
  
  // Test B2B
  const b2bCallId = await testB2BCall();
  if (b2bCallId) {
    await analyzeResults(b2bCallId, 'B2B');
  }
  
  // Test B2C
  const b2cCallId = await testB2CCall();
  if (b2cCallId) {
    await analyzeResults(b2cCallId, 'B2C');
  }
  
  console.log('\n✅ Test complete!');
  console.log('\nKey Differences:');
  console.log('- B2B: Captures company, title, industry, decision process');
  console.log('- B2C: Captures property type, household info, personal motivations');
  console.log('- Both: Appointments, contact info, qualification data');
}

// Check for API key
if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('your-key-here')) {
  console.error('❌ OpenAI API key not configured');
  process.exit(1);
}

// Run tests
runTests().catch(console.error);