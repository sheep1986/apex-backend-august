const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function checkDuplicateCalls() {
  console.log('🔍 Checking for duplicate calls...\n');

  // Get all calls from the campaign
  const { data: calls, error } = await client
    .from('calls')
    .select('*')
    .eq('campaign_id', '7227d85d-ab92-4859-abc0-8b017e19a942') // test 1 campaign
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching calls:', error);
    return;
  }

  console.log(`📞 Found ${calls.length} total calls in campaign\n`);

  // Group calls by unique identifiers
  const callsByPhone = {};
  const callsByVapiId = {};
  const duplicates = [];

  calls.forEach(call => {
    // Group by phone number
    const phone = call.to_number || call.phone_number;
    if (phone) {
      if (!callsByPhone[phone]) callsByPhone[phone] = [];
      callsByPhone[phone].push(call);
    }

    // Group by VAPI call ID
    if (call.vapi_call_id) {
      if (!callsByVapiId[call.vapi_call_id]) callsByVapiId[call.vapi_call_id] = [];
      callsByVapiId[call.vapi_call_id].push(call);
    }
  });

  // Check for duplicate phone numbers
  console.log('📱 Calls by phone number:');
  Object.entries(callsByPhone).forEach(([phone, phoneCalls]) => {
    console.log(`\n${phone}: ${phoneCalls.length} calls`);
    if (phoneCalls.length > 1) {
      console.log('  ⚠️ DUPLICATE CALLS TO SAME NUMBER:');
      phoneCalls.forEach(call => {
        console.log(`    - ID: ${call.id.substring(0, 8)}... Status: ${call.status}, Created: ${call.created_at}`);
      });
      duplicates.push(...phoneCalls.slice(1)); // All but the first are duplicates
    }
  });

  // Check for duplicate VAPI IDs
  console.log('\n\n🆔 Duplicate VAPI call IDs:');
  Object.entries(callsByVapiId).forEach(([vapiId, vapiCalls]) => {
    if (vapiCalls.length > 1) {
      console.log(`\n${vapiId}: ${vapiCalls.length} calls with same VAPI ID`);
      vapiCalls.forEach(call => {
        console.log(`  - ID: ${call.id.substring(0, 8)}... Status: ${call.status}`);
      });
    }
  });

  // Summary
  console.log('\n\n📊 Summary:');
  console.log(`- Total calls: ${calls.length}`);
  console.log(`- Unique phone numbers: ${Object.keys(callsByPhone).length}`);
  console.log(`- Potential duplicates: ${duplicates.length}`);

  // Show the actual duplicate IDs that should be removed
  if (duplicates.length > 0) {
    console.log('\n🗑️ Duplicate call IDs to remove:');
    const seen = new Set();
    duplicates.forEach(call => {
      if (!seen.has(call.id)) {
        console.log(`- ${call.id}`);
        seen.add(call.id);
      }
    });
  }
}

checkDuplicateCalls().then(() => process.exit(0));