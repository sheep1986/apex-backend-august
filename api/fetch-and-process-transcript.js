import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fetchAndProcessTranscript() {
  const callId = 'd69543b9-01d3-4279-b81d-2cd621a2024c';
  const vapiCallId = '8ea2bbfc-8bd3-4764-adf8-c71a11640881';
  
  console.log(`🔍 Fetching transcript for call ${callId}...\n`);
  
  try {
    // Get organization's VAPI credentials
    const { data: call } = await supabase
      .from('calls')
      .select('organization_id')
      .eq('id', callId)
      .single();
      
    const { data: org } = await supabase
      .from('organizations')
      .select('vapi_private_key')
      .eq('id', call.organization_id)
      .single();
      
    if (!org?.vapi_private_key) {
      console.error('No VAPI credentials found');
      return;
    }
    
    console.log('🔑 Using VAPI key:', org.vapi_private_key.substring(0, 10) + '...');
    
    // Try to fetch call details from VAPI
    try {
      const response = await fetch(`https://api.vapi.ai/call/${vapiCallId}`, {
        headers: {
          'Authorization': `Bearer ${org.vapi_private_key}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const vapiData = await response.json();
        console.log('\n✅ VAPI Response received');
        console.log('Has messages:', !!vapiData.messages, vapiData.messages?.length || 0, 'messages');
        console.log('Has transcript:', !!vapiData.transcript);
        
        // Build transcript from messages if available
        let transcript = '';
        
        // First check if we have a direct transcript field
        if (vapiData.transcript) {
          transcript = vapiData.transcript;
          console.log('Using direct transcript field');
          console.log('\nTranscript preview:');
          console.log(transcript.substring(0, 1000) + '...');
        } else if (vapiData.messages && Array.isArray(vapiData.messages)) {
          // Build from messages as fallback
          console.log('\n📝 Building transcript from messages...');
          
          // Log first few messages to understand structure
          console.log('\nFirst 3 messages structure:');
          vapiData.messages.slice(0, 3).forEach((msg, i) => {
            console.log(`Message ${i}:`, JSON.stringify(msg, null, 2));
          });
          
          transcript = vapiData.messages
            .filter(msg => msg.role === 'user' || msg.role === 'assistant')
            .map(msg => {
              const speaker = msg.role === 'user' ? 'User' : 'AI';
              return `${speaker}: ${msg.message || msg.content || ''}`;
            })
            .join('\n');
            
          console.log(`Built transcript with ${transcript.split('\n').length} lines`);
        }
        
        if (transcript) {
          // Update the database with the transcript
          console.log('\n📝 Updating database with transcript...');
          const { error: updateError } = await supabase
            .from('calls')
            .update({
              transcript: transcript,
              updated_at: new Date().toISOString()
            })
            .eq('id', callId);
            
          if (updateError) {
            console.error('Error updating database:', updateError);
          } else {
            console.log('✅ Transcript saved to database!');
            
            // Now trigger AI processing
            console.log('\n🤖 AI analysis would be triggered here');
            console.log('Call ready for OpenAI processing with transcript');
          }
        } else {
          console.log('❌ No transcript found in VAPI response');
        }
        
      } else {
        console.log('❌ VAPI API error:', response.status, response.statusText);
      }
    } catch (apiError) {
      console.error('VAPI fetch error:', apiError.message);
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

fetchAndProcessTranscript();