require('dotenv').config();
const axios = require('axios');

async function testOpenAIExtraction() {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  
  console.log('API Key present:', !!openaiApiKey);
  console.log('API Key starts with:', openaiApiKey ? openaiApiKey.substring(0, 10) + '...' : 'MISSING');
  
  if (!openaiApiKey) {
    console.error('No OpenAI API key found in environment');
    return;
  }

  const mattTranscript = `User: Hello?
AI: Hello. Is it possible to speak to Matt, please?
User: Speaking.
AI: Hi, Matt. This is Joanne calling from Emerald Green Energy. You spoke to 1 of our reps recently who was in your area about solar energy for your property. Does that sound familiar?
User: That's correct.
AI: Great. Thanks for confirming. I hope you've been enjoying the nice weather. So just to check, is solar something you'd considered before our rep visit or was it more of a new idea when they spoke to you?
User: That's a new idea.
AI: Completely understandable. We installed tier 1 panels and battery systems with built in finance so you can start saving from day 1 without a big deposit. A lot of people are just starting to look into it now, especially with energy prices being what they are. Well, the good news is you've qualified to receive 1 of our free no pressure consultations with our solar advisers. They'll inspect your roof, review your energy usage, and prepare a custom quote. No obligation at all. Looking at my calendar, we could schedule you for Wednesday at 6 PM. Does that work for you?
User: No. I can't do Wednesday. I'm afraid.
AI: No problem at all, Matt. What day or time would suit better this week? We're quite flexible, so just let me know what works best for you.
User: Can you do the evenings?
AI: Absolutely. We can do evenings. What about Thursday or Friday around 6 or 7 PM, or is there another evening that works better for you?
User: Friday at 6. That's fine. Thank you.
AI: Perfect. Friday at 6 PM, it is. I'll get that booked in for you, and you'll receive a confirmation shortly by email or text. And just so I don't send our agents to the wrong address, could you please confirm the first line of your address and your postcode for me?
User: Yep. 47
AI: Thanks, Madhya.
User: Tree Towage.
AI: Thanks, Matt. And could you just confirm your postcode as well? That way, I can make sure everything's spot on for Friday.
User: G 11 and 3 s u.
AI: Brilliant. Thanks for that, Matt. So that's 47 Tree Towage. G 11 3 s u. You're all set for your free solar consultation this Friday at 6 PM. Do you have any questions at all about the visit solar panels or how the whole process works? I'm happy to help.
User: Yeah. Can I just take your name, please, and a a a contact number? So I can get back to you.
AI: Of course, Matt. My name is Joanne, and I'm calling on behalf of Emerald Green Energy, Our main contact number is 0 8 0 0 1 2 3 4 5 6 7. If you need to reach us or have any questions before your appointment, just give us a ring and mention your booking for Friday at 6 PM. Is there anything else I can help with right now?
User: No. You've been very helpful. Thank you very much.
AI: You're very welcome, Matt. It was lovely speaking with you, and thanks for your time. We'll see you Friday at 6 PM for your free solar consultation. If anything comes up or you need to reschedule, just give us a call. Have a great rest of your day.
User: Alright. Awesome. Thank you. Bye.`;

  console.log('Testing OpenAI extraction with Matt\'s full transcript...\n');
  
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `You are an expert AI sales analyst. Extract ALL available information from this call transcript.
            
            Extract the following information:
            1. Contact information - name, email, phone, address (street, postcode)
            2. Appointment details - date, time
            3. Company/service mentioned
            4. Interest level and qualification
            
            Return a JSON object with these fields:
            {
              "contactInfo": { 
                "name": "", 
                "email": "", 
                "phone": "", 
                "address": "",
                "postcode": ""
              },
              "appointment": {
                "date": "",
                "time": ""
              },
              "company": "",
              "outcome": "",
              "summary": ""
            }`
          },
          {
            role: 'user',
            content: `Analyze this call transcript and extract all information:\n\n${mattTranscript}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 1000
      },
      {
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const analysis = JSON.parse(response.data.choices[0].message.content);
    console.log('=== OPENAI EXTRACTION RESULT ===');
    console.log(JSON.stringify(analysis, null, 2));
    
    console.log('\n=== KEY EXTRACTED DATA ===');
    console.log('Name:', analysis.contactInfo?.name || 'NOT EXTRACTED');
    console.log('Address:', analysis.contactInfo?.address || 'NOT EXTRACTED');
    console.log('Postcode:', analysis.contactInfo?.postcode || 'NOT EXTRACTED');
    console.log('Appointment:', analysis.appointment?.date, analysis.appointment?.time || 'NOT EXTRACTED');
    
  } catch (error) {
    if (error.response?.data) {
      console.error('OpenAI API Error:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

testOpenAIExtraction();