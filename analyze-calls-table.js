require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function analyzeCallsTable() {
  console.log('🔍 Analyzing calls table structure for CRM integration...');
  
  const { data: calls, error } = await supabase
    .from('calls')
    .select('*')
    .limit(1);

  if (error) {
    console.log('❌ Error accessing calls table:', error.message);
    return;
  }

  if (!calls || calls.length === 0) {
    console.log('📭 No calls found in table');
    return;
  }

  const sampleCall = calls[0];
  console.log('\n📋 Available call fields:');
  Object.keys(sampleCall).forEach(field => {
    const value = sampleCall[field];
    const type = typeof value;
    const preview = value ? String(value).substring(0, 50) : 'null';
    console.log(`  ${field}: ${type} = "${preview}"`);
  });

  console.log('\n🎯 CRM Mapping Analysis:');
  console.log('✅ Required fields available:');
  console.log(`  phone_number: ${sampleCall.phone_number ? '✅' : '❌'}`);
  console.log(`  customer_name: ${sampleCall.customer_name ? '✅' : '❌'}`);
  console.log(`  campaign_id: ${sampleCall.campaign_id ? '✅' : '❌'}`);
  console.log(`  organization_id: ${sampleCall.organization_id ? '✅' : '❌'}`);
  console.log(`  outcome: ${sampleCall.outcome ? '✅' : '❌'}`);
  console.log(`  summary: ${sampleCall.summary ? '✅' : '❌'}`);
  console.log(`  sentiment: ${sampleCall.sentiment ? '✅' : '❌'}`);
  console.log(`  ai_confidence_score: ${sampleCall.ai_confidence_score ? '✅' : '❌'}`);
  console.log(`  started_at: ${sampleCall.started_at ? '✅' : '❌'}`);
  console.log(`  duration: ${sampleCall.duration ? '✅' : '❌'}`);
}

analyzeCallsTable();