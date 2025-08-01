const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function debugCallDetails() {
  console.log('🔍 Debugging call details...\n');

  // Get Sanya's 5-second call
  const { data: call, error } = await client
    .from('calls')
    .select('*')
    .eq('id', '887729af-0133-41f7-a158-90d775e8f87e')
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Call details:');
  console.log('- ID:', call.id);
  console.log('- Customer:', call.customer_name);
  console.log('- Duration:', call.duration, 'seconds');
  console.log('- Status:', call.status);
  console.log('- Outcome:', call.outcome);
  console.log('- Recording URL:', call.recording_url);
  console.log('- Has transcript:', !!call.transcript);
  console.log('- Transcript length:', call.transcript ? call.transcript.length : 0);
  
  // Test what the API endpoint would return
  console.log('\n\nAPI Response format:');
  const apiResponse = {
    id: call.id,
    vapiCallId: call.vapi_call_id,
    campaignId: call.campaign_id,
    campaignName: 'test 2',
    leadId: call.lead_id,
    customerName: call.customer_name,
    customerPhone: call.phone_number,
    customerEmail: null,
    customerCompany: null,
    direction: call.direction,
    status: call.status,
    startedAt: call.started_at,
    endedAt: call.ended_at,
    duration: call.duration,
    cost: call.cost || 0,
    transcript: call.transcript,
    summary: call.summary,
    recording: call.recording_url,
    metadata: call.metadata,
    createdAt: call.created_at,
    updatedAt: call.updated_at
  };
  
  console.log(JSON.stringify(apiResponse, null, 2));
}

debugCallDetails().then(() => process.exit(0));