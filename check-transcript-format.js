const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function checkTranscriptFormat() {
  console.log('📝 Checking transcript format...\n');

  // Get a call with transcript
  const { data: call, error } = await client
    .from('calls')
    .select('id, customer_name, transcript')
    .eq('id', '887729af-0133-41f7-a158-90d775e8f87e') // Sanya's 5-second call
    .single();

  if (error) {
    console.error('Error fetching call:', error);
    return;
  }

  console.log(`Call: ${call.customer_name}`);
  console.log(`Transcript type: ${typeof call.transcript}`);
  console.log(`Transcript length: ${call.transcript ? call.transcript.length : 0}`);
  console.log('\nFirst 500 characters of transcript:');
  console.log(call.transcript ? call.transcript.substring(0, 500) : 'No transcript');
  
  if (call.transcript) {
    console.log('\n\nTranscript lines:');
    const lines = call.transcript.split('\n');
    lines.forEach((line, index) => {
      console.log(`Line ${index}: "${line}"`);
    });
  }
}

checkTranscriptFormat().then(() => process.exit(0));