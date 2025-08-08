const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function processCallWithAI() {
  const callId = 'e21ca2b5-9f7d-43ac-baa2-2657811ebfcf';
  
  // Get the call from database
  const { data: call, error } = await supabase
    .from('calls')
    .select('*')
    .eq('id', callId)
    .single();
    
  if (error || !call) {
    console.error('Call not found:', error);
    return;
  }
  
  console.log('Processing call:', {
    id: call.id,
    transcript: call.transcript ? 'Has transcript' : 'No transcript',
    duration: call.duration
  });
  
  // Analyze with GPT-4
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `You are an AI sales analyst. Analyze this call transcript to determine if the caller is a qualified lead.
            
            Extract:
            1. Is this a qualified lead? (true/false)
            2. Contact information (name, phone, company if mentioned)
            3. Key interest points
            4. Confidence score (0-1)
            
            Return JSON: {
              "isQualifiedLead": boolean,
              "confidenceScore": number,
              "contactInfo": { "name": "", "phone": "", "company": "" },
              "summary": "",
              "keyPoints": [],
              "sentiment": "positive/neutral/negative"
            }`
          },
          {
            role: 'user',
            content: `Call transcript:\n${call.transcript}\n\nDuration: ${call.duration} seconds`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const analysis = JSON.parse(response.data.choices[0].message.content);
    console.log('AI Analysis:', analysis);
    
    // Update the call with AI analysis
    const { error: updateError } = await supabase
      .from('calls')
      .update({
        ai_confidence_score: analysis.confidenceScore,
        ai_recommendation: analysis.isQualifiedLead ? 'accept' : 'review',
        qualification_status: analysis.isQualifiedLead && analysis.confidenceScore > 0.8 ? 'auto_accepted' : 'pending',
        sentiment: analysis.sentiment,
        key_points: analysis.keyPoints,
        updated_at: new Date().toISOString()
      })
      .eq('id', callId);
      
    if (updateError) {
      console.error('Update error:', updateError);
    } else {
      console.log('✅ Call updated with AI analysis');
      
      // If qualified, create CRM contact
      if (analysis.isQualifiedLead) {
        console.log('🎯 This is a qualified lead! Would add to CRM:', analysis.contactInfo);
      }
    }
    
  } catch (error) {
    console.error('OpenAI error:', error.response?.data || error.message);
  }
}

processCallWithAI();