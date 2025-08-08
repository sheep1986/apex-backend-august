const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function setupRealVapiRecordings() {
  console.log('🎯 Setting up REAL VAPI integration...\n');

  // Clear all fake recordings
  const { error: clearError } = await client
    .from('calls')
    .update({
      recording_url: null,
      transcript: null,
      summary: null,
      updated_at: new Date().toISOString()
    })
    .not('vapi_call_id', 'is', null);

  if (!clearError) {
    console.log('✅ Cleared all fake data');
  }

  console.log('\n📝 Instructions for REAL VAPI recordings:\n');
  console.log('1. VAPI webhooks MUST be configured with your public URL');
  console.log('2. Set webhook URL in VAPI dashboard to: https://YOUR-DOMAIN.com/api/vapi-automation-webhook');
  console.log('3. VAPI will send real recordings when calls complete');
  console.log('4. Recording URLs from VAPI are typically in format:');
  console.log('   https://storage.vapi.ai/[call-id]-[timestamp]-[uuid]-mono.wav');
  console.log('\n5. For local development, use ngrok:');
  console.log('   ngrok http 3001');
  console.log('   Then use the ngrok URL in VAPI webhook settings');
  
  console.log('\n⚠️  NO MORE FAKE DATA - Configure real VAPI webhooks!');
}

setupRealVapiRecordings().then(() => process.exit(0));