const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function cleanMockData() {
  console.log('🧹 Cleaning mock data from leads...\n');

  // Get all leads
  const { data: leads } = await client
    .from('leads')
    .select('*');

  console.log(`Found ${leads?.length || 0} leads to check\n`);

  for (const lead of leads || []) {
    console.log(`\nChecking lead: ${lead.first_name} ${lead.last_name || ''}`);
    
    // Find the corresponding call
    const { data: call } = await client
      .from('calls')
      .select('transcript')
      .eq('phone_number', lead.phone)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!call || !call.transcript) {
      console.log('  ⚠️  No call transcript found');
      continue;
    }

    // Check if the lead data matches what's in the transcript
    const transcript = call.transcript.toLowerCase();
    const updates = {};
    let needsUpdate = false;

    // Check first name
    if (lead.first_name && lead.first_name !== 'Unknown') {
      if (!transcript.includes(lead.first_name.toLowerCase())) {
        console.log(`  ❌ First name "${lead.first_name}" not found in transcript`);
        updates.first_name = 'Unknown';
        needsUpdate = true;
      }
    }

    // Check last name
    if (lead.last_name) {
      if (!transcript.includes(lead.last_name.toLowerCase())) {
        console.log(`  ❌ Last name "${lead.last_name}" not found in transcript`);
        updates.last_name = '';
        needsUpdate = true;
      }
    }

    // Check company
    if (lead.company) {
      if (!transcript.includes(lead.company.toLowerCase())) {
        console.log(`  ❌ Company "${lead.company}" not found in transcript`);
        updates.company = null;
        needsUpdate = true;
      }
    }

    // Check email
    if (lead.email) {
      if (!transcript.includes(lead.email.toLowerCase()) && !transcript.includes('@')) {
        console.log(`  ❌ Email "${lead.email}" not found in transcript`);
        updates.email = null;
        needsUpdate = true;
      }
    }

    // Check if score is realistic based on transcript length
    if (lead.score && lead.score > 0) {
      // If transcript is very short or shows no interest, score should be low
      if (transcript.length < 500 && lead.score > 50) {
        console.log(`  ⚠️  Score ${lead.score} seems high for short transcript`);
        updates.score = 0;
        needsUpdate = true;
      }
    }

    if (needsUpdate) {
      console.log('  🔧 Updating lead to remove mock data...');
      
      const { error } = await client
        .from('leads')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', lead.id);

      if (error) {
        console.error('  ❌ Update error:', error);
      } else {
        console.log('  ✅ Lead cleaned');
      }
    } else {
      console.log('  ✅ Lead data appears accurate');
    }
  }

  console.log('\n🎯 Cleanup complete!');
}

cleanMockData().then(() => process.exit(0));