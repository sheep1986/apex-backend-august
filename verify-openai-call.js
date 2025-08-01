const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function testOpenAICall() {
  console.log('🔍 Testing OpenAI API call with Sonia\'s transcript...\n');

  const transcript = `User: Hello?
AI: Hello. Is it possible to speak to Sonia, please?
User: Yeah. Speaking.
AI: Hi, Sonia. This is Joanne calling from Emerald Green Energy. You spoke to 1 of our reps recently who was in your area about solar energy for your property. Does that sound familiar?
User: Yes. It does.
AI: Great. Thanks for confirming. I hope you've been enjoying the nice weather. So just to check, was solar something you'd considered before our rep visited, or was it more of a new idea when they spoke to you?
User: Yeah. It was something that we can we was considering. I was having a discussion with my wife about it. And, yeah, it's it's something that we're definitely interested in.
AI: That makes perfect sense, Sonia. With energy prices being so high, a lot of our customers are looking for ways to save. Many choose our Hometree solar plan. It's 0 dollars upfront from 75 pounds a month, and most people start seeing savings straight away. The good news is you've qualified for a free no prep consultation with 1 of our solar advisers. They'll come out in inspect your roof, review your energy usage, and prepare a cost custom quote for you. No obligation at all. Now looking at my calendar, we've got you penciled in for Wednesday at 6 PM. Does that work for you, or would another day or time suit you better?
User: Yeah. When about 6 PM. Works fine for me.
AI: Fantastic. Wednesday at 6 PM, it is I'll send you a confirmation by text or email in just a moment. And just so I don't send our agents to the wrong address, could you please confirm the first line of your address and your postcode for me?
User: It's 1 0 7 Washington Street, and n 2 8 q u.
AI: Perfect. Thank you for confirming that Sonya. You're all booked in for Wednesday at 6 PM at 107 Washington Street and 28 q. You'll get a confirmation shortly. Before I let you go, do you have any questions about the consul consultation or about how the solar plan works? I'm happy to help.
User: No. That's fine. Thank you.
AI: Brilliant. Thanks so much for your time, Sonia. We look forward to seeing you on Wednesday at 6 PM. If anything comes up or you need to risk reschedule, just let us know. Have a lovely day.`;

  const prompt = `
You are an expert sales call analyst. Analyze this call transcript and extract comprehensive lead qualification data.

CALL TRANSCRIPT:
${transcript}

ANALYSIS REQUIREMENTS:
Provide a detailed JSON response with the following structure:

{
  "leadQuality": "hot|warm|cold|unqualified",
  "confidenceScore": 0.95,
  "keyInsights": ["key insight 1", "key insight 2"],
  "contactInfo": {
    "firstName": "extracted first name",
    "lastName": "extracted last name", 
    "phone": "extracted phone if mentioned",
    "email": "extracted email if mentioned",
    "company": "extracted company if mentioned",
    "address": "extracted address if mentioned"
  },
  "leadData": {
    "interestLevel": 8,
    "budget": "high|medium|low|unknown",
    "timeline": "immediate|short|medium|long|unknown",
    "decisionMaker": true,
    "painPoints": ["pain point 1", "pain point 2"],
    "nextSteps": "description of agreed next steps"
  },
  "qualification": {
    "qualified": true,
    "reason": "clear explanation of qualification decision",
    "followUpRequired": true,
    "priority": "high|medium|low"
  }
}

SCORING CRITERIA:
- HOT: Immediate interest, budget confirmed, appointment scheduled, decision maker
- WARM: Strong interest, some budget indication, timeline discussed
- COLD: Mild interest, unclear budget/timeline, needs nurturing
- UNQUALIFIED: No interest, no budget, not decision maker, do not call requests

Interest Level (1-10):
- 10: Ready to buy now, appointment scheduled
- 8-9: Very interested, discussing specifics
- 6-7: Interested but needs more information
- 4-5: Mild interest, exploring options
- 1-3: Little to no interest

Extract ALL mentioned contact details, pain points, objections, and next steps from the conversation.
`;

  try {
    console.log('📡 Making OpenAI API call...');
    const start = Date.now();
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system", 
          content: "You are an expert sales call analyst. Always respond with valid JSON only, no additional text or formatting."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 1500
    });

    const duration = Date.now() - start;
    console.log(`✅ OpenAI API call completed in ${duration}ms\n`);

    const response = completion.choices[0]?.message?.content;
    console.log('🤖 RAW OpenAI Response:');
    console.log('=' * 50);
    console.log(response);
    console.log('=' * 50);

    const analysis = JSON.parse(response);
    
    console.log('\n📊 PARSED Analysis Results:');
    console.log('Lead Quality:', analysis.leadQuality);
    console.log('Confidence Score:', analysis.confidenceScore);
    console.log('Interest Level:', analysis.leadData.interestLevel);
    console.log('Qualified:', analysis.qualification.qualified);
    console.log('Key Insights:', analysis.keyInsights.length, 'insights');
    
    console.log('\n🔍 Token Usage:');
    console.log('Prompt tokens:', completion.usage?.prompt_tokens);
    console.log('Completion tokens:', completion.usage?.completion_tokens);
    console.log('Total tokens:', completion.usage?.total_tokens);
    
    console.log('\n✅ This confirms OpenAI actually analyzed the transcript and generated the response!');

  } catch (error) {
    console.error('❌ OpenAI API call failed:', error);
    if (error.response) {
      console.log('API Error Status:', error.response.status);
      console.log('API Error Data:', error.response.data);
    }
  }
}

testOpenAICall().then(() => process.exit(0));