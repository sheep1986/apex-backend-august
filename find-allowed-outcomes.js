require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findAllowedOutcomes() {
  console.log('🔍 Finding all allowed outcome values...');
  
  const testOutcomes = [
    'busy', 'no_answer', 'answered', 'failed', 'voicemail', 
    'completed', 'success', 'not_interested', 'callback_requested',
    'qualified', 'not_qualified', 'appointment_scheduled'
  ];
  
  const { data: testCall } = await supabase
    .from('calls')
    .select('id')
    .limit(1)
    .single();
  
  const allowedOutcomes = [];
  
  if (testCall) {
    for (const outcome of testOutcomes) {
      const { error } = await supabase
        .from('calls')
        .update({ outcome })
        .eq('id', testCall.id);
      
      if (!error || error.message.indexOf('check constraint') === -1) {
        allowedOutcomes.push(outcome);
        console.log(`   ✅ '${outcome}' - ALLOWED`);
        
        // Reset for next test
        await supabase
          .from('calls')
          .update({ outcome: null })
          .eq('id', testCall.id);
      } else {
        console.log(`   ❌ '${outcome}' - Not allowed`);
      }
    }
    
    console.log('\n📋 Complete list of allowed outcomes:');
    allowedOutcomes.forEach(outcome => console.log(`   - '${outcome}'`));
    
    // Now create the correct mapping
    console.log('\n🎯 Correct mapping for VAPI outcomes:');
    const mapping = {
      'customer-ended-call': allowedOutcomes.includes('answered') ? 'answered' : allowedOutcomes[0],
      'assistant-ended-call': allowedOutcomes.includes('answered') ? 'answered' : allowedOutcomes[0], 
      'silence-timed-out': allowedOutcomes.includes('no_answer') ? 'no_answer' : allowedOutcomes[0],
      'customer-did-not-answer': allowedOutcomes.includes('no_answer') ? 'no_answer' : allowedOutcomes[0]
    };
    
    Object.entries(mapping).forEach(([vapi, mapped]) => {
      console.log(`   ${vapi} → ${mapped}`);
    });
  }
}

findAllowedOutcomes().catch(console.error);