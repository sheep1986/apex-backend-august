const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function setupRealtimeAIProcessing() {
  console.log('🔄 Setting up real-time AI processing for new calls...\n');

  // Subscribe to new calls
  const subscription = client
    .channel('call-changes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'calls',
        filter: 'transcript=neq.null'
      },
      async (payload) => {
        console.log('📞 New call detected:', payload.new.id);
        console.log('   Customer:', payload.new.customer_name);
        console.log('   Duration:', payload.new.duration, 'seconds');
        console.log('   Has transcript:', !!payload.new.transcript);
        
        // Only process if not already processed
        if (!payload.new.ai_confidence_score && payload.new.transcript && payload.new.duration > 30) {
          console.log('   🤖 Triggering AI analysis...');
          
          // Import and run the processor
          try {
            const { processCallsAndCreateLeads } = require('./process-calls-create-leads');
            // Process just this call
            await processSpecificCall(payload.new.id);
            console.log('   ✅ AI processing complete');
          } catch (error) {
            console.error('   ❌ AI processing failed:', error.message);
          }
        }
      }
    )
    .subscribe();

  console.log('✅ Real-time AI processing active');
  console.log('🎯 Make a call through VAPI and it will be automatically processed!\n');
  console.log('Press Ctrl+C to stop monitoring...');
}

async function processSpecificCall(callId) {
  // This would run the AI analysis on a specific call
  // For now, we'll use the existing process-calls-create-leads logic
  const { exec } = require('child_process');
  exec('node process-calls-create-leads.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return;
    }
    console.log(stdout);
  });
}

setupRealtimeAIProcessing();