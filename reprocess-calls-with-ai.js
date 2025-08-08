const supabase = require('@supabase/supabase-js');
const { processCallWithAI } = require('./services/ai-call-processor');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function reprocessCallsWithAI() {
  console.log('🤖 Reprocessing calls with AI...\n');

  // Get calls with transcripts but low/no AI scores
  const { data: calls } = await client
    .from('calls')
    .select('*')
    .not('transcript', 'is', null)
    .or('ai_confidence_score.is.null,ai_confidence_score.eq.0')
    .order('duration', { ascending: false })
    .limit(5);

  console.log(`Found ${calls?.length || 0} calls to reprocess:\n`);

  for (const call of calls || []) {
    console.log(`\n📞 Processing: ${call.customer_name || 'Unknown'} (${call.duration}s)`);
    console.log(`   Phone: ${call.phone_number}`);
    console.log(`   Current AI Score: ${call.ai_confidence_score || 0}`);
    
    try {
      // Create VAPI-like data structure
      const vapiData = {
        id: call.vapi_call_id || call.id,
        status: 'ended',
        duration: call.duration,
        transcript: call.transcript,
        summary: call.summary,
        customer: {
          number: call.phone_number,
          name: call.customer_name
        },
        recordingUrl: call.recording_url,
        endedReason: call.outcome === 'completed' ? 'assistant-ended-call' : 'customer-ended-call'
      };

      // Process with AI
      await processCallWithAI(call.id, vapiData);
      
      // Check the result
      const { data: updated } = await client
        .from('calls')
        .select('ai_confidence_score, ai_recommendation, qualification_status, created_crm_contact')
        .eq('id', call.id)
        .single();
        
      console.log(`   ✅ New AI Score: ${(updated.ai_confidence_score * 100).toFixed(0)}%`);
      console.log(`   ✅ Recommendation: ${updated.ai_recommendation}`);
      console.log(`   ✅ Qualification: ${updated.qualification_status}`);
      console.log(`   ✅ Created Lead: ${updated.created_crm_contact ? 'Yes' : 'No'}`);
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }

  // Check final lead count
  const { count } = await client
    .from('leads')
    .select('*', { count: 'exact', head: true });
    
  console.log(`\n📊 Total leads after processing: ${count}`);
}

reprocessCallsWithAI().then(() => process.exit(0));