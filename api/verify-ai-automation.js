import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyAIAutomation() {
  const callId = 'd69543b9-01d3-4279-b81d-2cd621a2024c';
  
  console.log(`🔍 Verifying AI automation for call ${callId}...\n`);
  
  try {
    // Check the call's update history
    const { data: call, error } = await supabase
      .from('calls')
      .select('*')
      .eq('id', callId)
      .single();
      
    if (error || !call) {
      console.error('Call not found:', error);
      return;
    }
    
    console.log('Call Timeline:');
    console.log('=====================================');
    console.log(`Created: ${new Date(call.created_at).toLocaleString()}`);
    console.log(`Last Updated: ${new Date(call.updated_at).toLocaleString()}`);
    console.log(`\nCurrent Status:`);
    console.log(`- Outcome: ${call.outcome}`);
    console.log(`- Sentiment: ${call.sentiment}`);
    console.log(`- Qualification Status: ${call.qualification_status}`);
    console.log(`- Is Qualified Lead: ${call.is_qualified_lead}`);
    console.log(`- AI Confidence Score: ${call.ai_confidence_score}`);
    console.log(`- Has Transcript: ${call.transcript ? 'Yes' : 'No'}`);
    console.log(`- Has Summary: ${call.summary ? 'Yes' : 'No'}`);
    console.log(`- Has AI Recommendation: ${call.ai_recommendation ? 'Yes' : 'No'}`);
    
    // Check if this was updated by the campaign executor/webhook
    console.log('\n\nChecking for automated processing...');
    
    // The call was created at 2025-08-01T17:10:14.756062+00:00
    // Last updated at 2025-08-06T11:21:51.043259+00:00
    
    const createdDate = new Date(call.created_at);
    const updatedDate = new Date(call.updated_at);
    const hoursSinceCreation = (updatedDate - createdDate) / (1000 * 60 * 60);
    
    console.log(`\nTime Analysis:`);
    console.log(`- Call created: ${call.created_at}`);
    console.log(`- Call updated: ${call.updated_at}`);
    console.log(`- Hours between: ${hoursSinceCreation.toFixed(2)} hours`);
    
    if (hoursSinceCreation > 100) {
      console.log('\n⚠️  This call was updated MUCH LATER (5+ days) after creation');
      console.log('This suggests MANUAL intervention, not automatic processing');
    }
    
    // Check for AI processing markers
    console.log('\n\nAI Processing Indicators:');
    console.log(`- AI Confidence Score: ${call.ai_confidence_score || 'Not set'}`);
    console.log(`- Qualification Status: ${call.qualification_status || 'Not set'}`);
    console.log(`- Summary: ${call.summary || 'Not set'}`);
    
    if (!call.ai_confidence_score && !call.summary && call.qualification_status === 'pending') {
      console.log('\n❌ NO AI PROCESSING DETECTED');
      console.log('The outcome was likely set manually or by basic logic');
    } else {
      console.log('\n✅ AI PROCESSING DETECTED');
      console.log('The call has AI-generated fields populated');
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

verifyAIAutomation();