import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function updateMattCall() {
  const callId = 'fdbfcfa2-7a01-4f7c-b162-95ca182f8f8f';
  
  console.log(`📝 Updating Matt's call...\n`);
  
  try {
    // Get the call
    const { data: call } = await supabase
      .from('calls')
      .select('recording_url, transcript')
      .eq('id', callId)
      .single();
      
    console.log('Current data:');
    console.log(`Recording URL: ${call.recording_url}`);
    console.log(`Transcript length: ${call.transcript?.length || 0} characters`);
    
    // Simple update with just the essentials
    const { error } = await supabase
      .from('calls')
      .update({
        outcome: 'interested',
        sentiment: 'positive',
        is_qualified_lead: true,
        qualification_status: 'qualified',
        status: 'completed'
      })
      .eq('id', callId);
      
    if (error) {
      console.error('Error:', error);
    } else {
      console.log('\n✅ Call updated successfully!');
      console.log('\n📊 Summary:');
      console.log('- Customer: Matt');
      console.log('- Outcome: INTERESTED');
      console.log('- Appointment scheduled for Friday at 6 PM');
      console.log('- Recording available');
      console.log('- Full transcript available');
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

updateMattCall();