const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function removeDuplicateCalls() {
  console.log('🧹 Removing duplicate calls...\n');

  // Get all campaigns
  const { data: campaigns, error: campaignError } = await client
    .from('campaigns')
    .select('id, name')
    .order('created_at', { ascending: false });

  if (campaignError) {
    console.error('❌ Error fetching campaigns:', campaignError);
    return;
  }

  let totalRemoved = 0;

  // Process each campaign
  for (const campaign of campaigns) {
    const { data: calls, error } = await client
      .from('calls')
      .select('*')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: true });

    if (error || !calls || calls.length === 0) continue;

    // Group by phone number
    const callsByPhone = {};
    calls.forEach(call => {
      const phone = call.to_number || call.phone_number;
      if (phone) {
        if (!callsByPhone[phone]) callsByPhone[phone] = [];
        callsByPhone[phone].push(call);
      }
    });

    // Find duplicates for this campaign
    const duplicatesToRemove = [];
    Object.entries(callsByPhone).forEach(([phone, phoneCalls]) => {
      if (phoneCalls.length > 1) {
        // Keep the completed call, remove initiated ones
        const completedCall = phoneCalls.find(c => c.status === 'completed' || c.status === 'busy' || c.status === 'no_answer' || c.status === 'voicemail');
        const initiatedCalls = phoneCalls.filter(c => c.status === 'initiated' || c.status === 'ringing');
        
        if (completedCall && initiatedCalls.length > 0) {
          // Remove the initiated calls since we have a completed one
          duplicatesToRemove.push(...initiatedCalls);
        } else if (phoneCalls.length > 1) {
          // If no completed call, keep the most recent one
          const toKeep = phoneCalls[phoneCalls.length - 1];
          const toRemove = phoneCalls.filter(c => c.id !== toKeep.id);
          duplicatesToRemove.push(...toRemove);
        }
      }
    });

    if (duplicatesToRemove.length > 0) {
      console.log(`\n📞 Campaign: ${campaign.name}`);
      console.log(`   Found ${duplicatesToRemove.length} duplicates to remove`);
      
      // Remove the duplicates
      for (const call of duplicatesToRemove) {
        const { error: deleteError } = await client
          .from('calls')
          .delete()
          .eq('id', call.id);

        if (deleteError) {
          console.log(`   ❌ Error removing ${call.id}: ${deleteError.message}`);
        } else {
          console.log(`   ✅ Removed duplicate: ${call.id.substring(0, 8)}... (${call.status})`);
          totalRemoved++;
        }
      }
    }
  }

  console.log(`\n\n🎉 Total duplicates removed: ${totalRemoved}`);
}

removeDuplicateCalls().then(() => process.exit(0));