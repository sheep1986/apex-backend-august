import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkValidOutcomes() {
  console.log('🔍 Checking valid outcome values...\n');
  
  try {
    // Get distinct outcome values from existing calls
    const { data: outcomes, error } = await supabase
      .from('calls')
      .select('outcome')
      .not('outcome', 'is', null);
      
    if (error) {
      console.error('Error fetching outcomes:', error);
      return;
    }
    
    const uniqueOutcomes = [...new Set(outcomes.map(o => o.outcome))];
    console.log('Existing outcome values in database:');
    uniqueOutcomes.forEach(o => console.log(`- ${o}`));
    
    // Try to get table definition via SQL
    const { data: checkResult, error: checkError } = await supabase.rpc('get_constraint_def', {
      table_name: 'calls',
      constraint_pattern: '%outcome%'
    }).single();
    
    if (checkResult) {
      console.log('\nConstraint definition:', checkResult);
    } else if (checkError) {
      // Try a different approach - test various values
      console.log('\n\nTesting common outcome values...');
      const testOutcomes = [
        'answered', 'completed', 'no_answer', 'busy', 'failed', 
        'voicemail', 'quick_hangup', 'provider_error', 'system_error',
        'configuration_error', 'unknown', 'success', 'hangup',
        'call-ended', 'ended'
      ];
      
      for (const testOutcome of testOutcomes) {
        // Try to insert a dummy record with this outcome
        const { error: testError } = await supabase
          .from('calls')
          .insert({
            id: `test-${Date.now()}-${Math.random()}`,
            organization_id: '2566d8c5-2245-4a3c-b539-4cea21a07d9b',
            campaign_id: '3e5852ce-1821-4518-b983-0abbcc679844',
            outcome: testOutcome,
            status: 'completed',
            duration: 0,
            cost: 0,
            started_at: new Date().toISOString(),
            direction: 'outbound'
          });
          
        if (!testError) {
          console.log(`✅ Valid outcome: "${testOutcome}"`);
          // Clean up the test record
          await supabase.from('calls').delete().match({ outcome: testOutcome, duration: 0 });
        } else if (testError.message?.includes('violates check constraint')) {
          console.log(`❌ Invalid outcome: "${testOutcome}"`);
        }
      }
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

checkValidOutcomes();