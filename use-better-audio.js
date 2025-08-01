const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function useBetterAudio() {
  console.log('🎵 Updating with better audio URLs...\n');

  // Use a reliable public audio file
  const audioUrl = 'https://commondatastorage.googleapis.com/codeskulptor-assets/Epoq-Lepidoptera.ogg';
  
  // Update all calls with recordings
  const { data: calls } = await client
    .from('calls')
    .select('id, customer_name')
    .not('recording_url', 'is', null);

  for (const call of calls || []) {
    const { error } = await client
      .from('calls')
      .update({
        recording_url: audioUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', call.id);

    if (!error) {
      console.log(`✅ Updated ${call.customer_name || 'Unknown'}'s call`);
    }
  }
}

useBetterAudio().then(() => process.exit(0));