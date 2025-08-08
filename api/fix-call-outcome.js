import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixCallOutcome() {
  const callId = 'd69543b9-01d3-4279-b81d-2cd621a2024c';
  console.log(`🔧 Fixing call outcome for call ${callId}...\n`);
  
  try {
    // First, let's look at the call details
    const { data: call, error: fetchError } = await supabase
      .from('calls')
      .select('*')
      .eq('id', callId)
      .single();
      
    if (fetchError) {
      console.error('Error fetching call:', fetchError);
      return;
    }
    
    console.log('Current call data:');
    console.log(`- Status: ${call.status}`);
    console.log(`- Outcome: ${call.outcome}`);
    console.log(`- Duration: ${call.duration} seconds`);
    console.log(`- Cost: $${call.cost}`);
    console.log(`- Started: ${new Date(call.started_at).toLocaleString()}`);
    
    // Based on the data:
    // - Status is "completed" (call connected and finished normally)
    // - Duration is 262 seconds (over 4 minutes)
    // - Cost is $0.6196 (confirms call was connected and billable)
    // This should be "interested" (qualified lead) based on the enum values
    
    // The valid outcomes appear to be: interested, not_interested, callback, voicemail, no_answer, wrong_number, do_not_call, failed
    const correctOutcome = call.duration > 30 ? 'interested' : 'no_answer';
    
    console.log(`\n✅ Correct outcome should be: "${correctOutcome}" (based on ${call.duration}s duration)`);
    
    // Update the call outcome
    const { error: updateError } = await supabase
      .from('calls')
      .update({ 
        outcome: correctOutcome,
        updated_at: new Date().toISOString()
      })
      .eq('id', callId);
      
    if (updateError) {
      console.error('❌ Error updating call:', updateError);
    } else {
      console.log(`\n✅ Successfully updated call outcome from "failed" to "${correctOutcome}"`);
      
      // Verify the update
      const { data: updatedCall } = await supabase
        .from('calls')
        .select('id, outcome, status, duration')
        .eq('id', callId)
        .single();
        
      console.log('\nUpdated call:');
      console.log(JSON.stringify(updatedCall, null, 2));
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

// Add confirmation
console.log('This will fix the call outcome from "failed" to the correct status based on duration.');
console.log('Press Ctrl+C to cancel, or wait 3 seconds to continue...\n');

setTimeout(() => {
  fixCallOutcome();
}, 3000);