import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function simpleUpdateCall() {
  const callId = 'd69543b9-01d3-4279-b81d-2cd621a2024c';
  
  console.log(`📝 Simple update for call ${callId}...\n`);
  
  try {
    // Try a minimal update first
    const { error } = await supabase
      .from('calls')
      .update({
        outcome: 'interested',
        sentiment: 'positive'
      })
      .eq('id', callId);
      
    if (error) {
      console.error('Error with minimal update:', error);
      
      // Try just outcome
      const { error: error2 } = await supabase
        .from('calls')
        .update({
          outcome: 'interested'
        })
        .eq('id', callId);
        
      if (error2) {
        console.error('Error updating just outcome:', error2);
      } else {
        console.log('✅ Updated outcome to "interested"');
      }
    } else {
      console.log('✅ Successfully updated call!');
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

simpleUpdateCall();