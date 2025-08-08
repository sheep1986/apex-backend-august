import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCallTranscriptDetails() {
  const callId = 'd69543b9-01d3-4279-b81d-2cd621a2024c';
  console.log(`🔍 Checking transcript details for call ${callId}...\n`);
  
  try {
    const { data: call, error } = await supabase
      .from('calls')
      .select('*')
      .eq('id', callId)
      .single();
      
    if (error) {
      console.error('Error fetching call:', error);
      return;
    }
    
    console.log('Call details:');
    console.log('=====================================');
    console.log(`Status: ${call.status}`);
    console.log(`Outcome: ${call.outcome}`);
    console.log(`Duration: ${call.duration} seconds`);
    console.log(`Cost: $${call.cost}`);
    console.log(`Has transcript: ${call.transcript ? 'Yes' : 'No'}`);
    console.log(`Transcript type: ${typeof call.transcript}`);
    
    if (call.transcript) {
      console.log(`\nTranscript content type: ${typeof call.transcript}`);
      console.log(`Is array: ${Array.isArray(call.transcript)}`);
      console.log(`Is string: ${typeof call.transcript === 'string'}`);
      
      // Try to parse if it's a string
      if (typeof call.transcript === 'string') {
        console.log(`\nTranscript (first 500 chars):`);
        console.log(call.transcript.substring(0, 500));
        
        // Check if it looks like JSON
        if (call.transcript.startsWith('[') || call.transcript.startsWith('{')) {
          try {
            const parsed = JSON.parse(call.transcript);
            console.log(`\nParsed as JSON - Array length: ${Array.isArray(parsed) ? parsed.length : 'Not an array'}`);
            if (Array.isArray(parsed) && parsed.length > 0) {
              console.log(`First message:`, parsed[0]);
            }
          } catch (e) {
            console.log('Could not parse as JSON');
          }
        }
      } else if (Array.isArray(call.transcript)) {
        console.log(`\nTranscript array length: ${call.transcript.length}`);
        if (call.transcript.length > 0) {
          console.log(`First message:`, call.transcript[0]);
        }
      }
    }
    
    // Check other AI-related fields
    console.log(`\n\nAI Analysis Status:`);
    console.log(`- Sentiment: ${call.sentiment || 'Not analyzed'}`);
    console.log(`- Qualification status: ${call.qualification_status || 'Not set'}`);
    console.log(`- AI recommendation: ${call.ai_recommendation || 'None'}`);
    console.log(`- Is qualified lead: ${call.is_qualified_lead}`);
    console.log(`- AI confidence score: ${call.ai_confidence_score || 0}`);
    console.log(`- Summary: ${call.summary ? 'Yes' : 'No'}`);
    
    if (call.summary) {
      console.log(`\nSummary: ${call.summary}`);
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

checkCallTranscriptDetails();