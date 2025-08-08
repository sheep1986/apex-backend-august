import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function analyzeMattCall() {
  const callId = 'fdbfcfa2-7a01-4f7c-b162-95ca182f8f8f';
  
  console.log(`🤖 Analyzing Matt's call...\n`);
  
  try {
    // Get the call with transcript
    const { data: call, error } = await supabase
      .from('calls')
      .select('*')
      .eq('id', callId)
      .single();
      
    if (error || !call) {
      console.error('Call not found:', error);
      return;
    }
    
    console.log('📞 Call Details:');
    console.log(`   Customer: ${call.customer_name}`);
    console.log(`   Duration: ${call.duration}s`);
    console.log(`   Cost: $${call.cost}`);
    console.log(`   Recording: ${call.recording_url ? 'Available' : 'Not available'}`);
    console.log(`   Transcript length: ${call.transcript?.length || 0} characters`);
    
    if (!call.transcript) {
      console.error('No transcript found');
      return;
    }
    
    console.log('\n📝 Analyzing transcript with OpenAI...\n');
    
    // Analyze with OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        {
          role: 'system',
          content: `You are an expert sales analyst for Emerald Green Energy (solar company). Analyze this sales call transcript and determine:
          
          1. Call Outcome - Must be one of these exact values:
             - "interested" - Customer shows interest, wants to proceed, books appointment
             - "not_interested" - Customer declines, not interested
             - "callback" - Customer explicitly requests a callback at a later time
             - "voicemail" - Call went to voicemail
             - "no_answer" - No one answered
          
          2. Key Information:
             - Customer name
             - Interest level (1-10)
             - Appointment scheduled? (yes/no, date/time if yes)
             - Key objections or concerns
             - Next steps
          
          3. Should a CRM lead be created? (only if outcome is "interested")
          
          Return a JSON object with these exact fields:
          {
            "outcome": "interested|not_interested|callback|voicemail|no_answer",
            "sentiment": "positive|neutral|negative",
            "interestLevel": 1-10,
            "summary": "Brief summary of the call",
            "appointmentScheduled": true/false,
            "appointmentDateTime": "ISO date string or null",
            "keyPoints": ["array of key points"],
            "objections": ["array of objections"],
            "nextSteps": "What should happen next",
            "createCRMLead": true/false,
            "customerName": "extracted name or null"
          }`
        },
        {
          role: 'user',
          content: `Analyze this solar sales call transcript:\n\n${call.transcript}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 1000
    });
    
    const analysis = JSON.parse(response.choices[0].message.content);
    console.log('✅ AI Analysis Complete:\n');
    console.log(JSON.stringify(analysis, null, 2));
    
    // Update the call with AI analysis
    const updateData = {
      outcome: analysis.outcome,
      sentiment: analysis.sentiment,
      summary: analysis.summary?.substring(0, 255),
      ai_recommendation: analysis.nextSteps?.substring(0, 255),
      is_qualified_lead: analysis.createCRMLead,
      qualification_status: analysis.createCRMLead ? 'qualified' : 'pending',
      ai_confidence_score: analysis.interestLevel / 10,
      status: 'completed',
      updated_at: new Date().toISOString()
    };
    
    console.log('\n📝 Updating call with AI analysis...');
    const { error: updateError } = await supabase
      .from('calls')
      .update(updateData)
      .eq('id', callId);
      
    if (updateError) {
      console.error('Error updating call:', updateError);
    } else {
      console.log('✅ Call updated successfully!');
      
      if (analysis.createCRMLead) {
        console.log('\n🎯 Customer is INTERESTED - CRM lead should be created');
        if (analysis.appointmentScheduled) {
          console.log(`📅 Appointment scheduled: ${analysis.appointmentDateTime || 'Time TBD'}`);
        }
      } else {
        console.log(`\n❌ Customer is ${analysis.outcome.toUpperCase()} - No CRM lead needed`);
      }
      
      console.log('\n📊 Recording URL:');
      console.log(call.recording_url);
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

analyzeMattCall();