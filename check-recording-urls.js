const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function checkRecordingUrls() {
  console.log('🎵 Checking recording URLs...\n');

  // Get all calls with recordings
  const { data: calls, error } = await client
    .from('calls')
    .select('id, recording_url, status, customer_name, campaign_id')
    .not('recording_url', 'is', null)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching calls:', error);
    return;
  }

  console.log(`📞 Found ${calls.length} calls with recordings\n`);

  // Analyze the URLs
  const urlPatterns = {};
  calls.forEach(call => {
    const url = call.recording_url;
    let pattern = 'unknown';
    
    if (url.includes('vapi.ai/recordings/')) {
      pattern = 'fake-vapi-recordings';
    } else if (url.includes('storage.vapi.ai/')) {
      pattern = 'realistic-vapi-storage';
    } else if (url.includes('http')) {
      pattern = 'other-http-url';
    } else {
      pattern = 'non-http-path';
    }

    if (!urlPatterns[pattern]) urlPatterns[pattern] = [];
    urlPatterns[pattern].push(call);
  });

  // Report findings
  Object.entries(urlPatterns).forEach(([pattern, patternCalls]) => {
    console.log(`\n📁 Pattern: ${pattern}`);
    console.log(`   Count: ${patternCalls.length}`);
    console.log('   Examples:');
    patternCalls.slice(0, 3).forEach(call => {
      console.log(`     - ${call.id.substring(0, 8)}... : ${call.recording_url}`);
    });
  });

  // Find calls that should have recordings but don't
  const { data: callsWithoutRecording, count } = await client
    .from('calls')
    .select('id, status, customer_name', { count: 'exact' })
    .is('recording_url', null)
    .in('status', ['completed', 'connected']);

  console.log(`\n\n⚠️ Found ${count} completed calls without recordings`);
  if (callsWithoutRecording && callsWithoutRecording.length > 0) {
    console.log('   Examples:');
    callsWithoutRecording.slice(0, 5).forEach(call => {
      console.log(`     - ${call.id.substring(0, 8)}... : ${call.status} - ${call.customer_name}`);
    });
  }
}

checkRecordingUrls().then(() => process.exit(0));