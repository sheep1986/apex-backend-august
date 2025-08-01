const supabase = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function fixSanyaCallDuration() {
  console.log('🔧 Fixing Sanya\'s call duration...\n');

  // Get VAPI API key
  const { data: org } = await client
    .from('organizations')
    .select('vapi_private_key')
    .eq('id', '2566d8c5-2245-4a3c-b539-4cea21a07d9b')
    .single();
    
  const apiKey = org?.vapi_private_key;
  if (!apiKey) {
    console.error('No VAPI API key found');
    return;
  }

  // Fetch the actual call data from VAPI
  const vapiCallId = '43d8e5a4-45d9-4f4d-8741-62d4defbe539';
  
  try {
    console.log(`Fetching VAPI call ${vapiCallId}...`);
    
    const response = await axios.get(
      `https://api.vapi.ai/call/${vapiCallId}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const vapiData = response.data;
    console.log('\nVAPI Call Data:');
    console.log('- Status:', vapiData.status);
    console.log('- Customer:', vapiData.customer?.number);
    console.log('- Started:', vapiData.startedAt);
    console.log('- Ended:', vapiData.endedAt);
    
    // Calculate actual duration
    let actualDuration = 0;
    if (vapiData.startedAt && vapiData.endedAt) {
      actualDuration = Math.round((new Date(vapiData.endedAt) - new Date(vapiData.startedAt)) / 1000);
      console.log('- Calculated duration:', actualDuration, 'seconds (', Math.floor(actualDuration / 60), 'min', actualDuration % 60, 'sec)');
    } else if (vapiData.duration) {
      actualDuration = Math.round(vapiData.duration);
      console.log('- VAPI duration:', actualDuration, 'seconds');
    }
    
    console.log('- Cost:', vapiData.cost);
    console.log('- Recording:', vapiData.recordingUrl ? 'Yes' : 'No');
    
    // Update the call with correct duration
    console.log('\nUpdating database...');
    
    const { error } = await client
      .from('calls')
      .update({
        duration: actualDuration,
        cost: vapiData.cost || 0.3221, // From the previous sync
        started_at: vapiData.startedAt,
        ended_at: vapiData.endedAt,
        updated_at: new Date().toISOString()
      })
      .eq('vapi_call_id', vapiCallId);
      
    if (error) {
      console.error('❌ Error updating call:', error);
    } else {
      console.log('✅ Updated call duration to', actualDuration, 'seconds');
    }
    
    // Verify the update
    const { data: updatedCall } = await client
      .from('calls')
      .select('customer_name, duration, started_at, ended_at')
      .eq('vapi_call_id', vapiCallId)
      .single();
      
    console.log('\nVerification:');
    console.log('- Customer:', updatedCall.customer_name);
    console.log('- Duration:', updatedCall.duration, 'seconds');
    console.log('- Time range:', new Date(updatedCall.started_at).toLocaleTimeString(), '-', new Date(updatedCall.ended_at).toLocaleTimeString());
    
  } catch (error) {
    console.error('Error fetching VAPI data:', error.message);
  }
}

fixSanyaCallDuration().then(() => process.exit(0));