const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function analyzeLeadDecisions() {
  console.log('🔍 Analyzing Lead Creation Decisions...\n');

  // Get all leads
  const { data: leads } = await client
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });

  console.log(`📊 Total Leads Created: ${leads?.length || 0}\n`);

  // Get all AI-processed calls
  const { data: calls } = await client
    .from('calls')
    .select('*')
    .not('ai_confidence_score', 'is', null)
    .order('created_at', { ascending: false });

  console.log('🤖 AI Analysis Results:\n');

  // Analyze each call
  for (const call of calls || []) {
    console.log(`📞 ${call.customer_name || 'Unknown'} (${call.phone_number})`);
    console.log(`   Duration: ${call.duration}s`);
    console.log(`   AI Score: ${(call.ai_confidence_score * 100).toFixed(0)}%`);
    console.log(`   AI Recommendation: ${call.ai_recommendation || 'None'}`);
    console.log(`   Sentiment: ${call.sentiment || 'Unknown'}`);
    console.log(`   Qualification Status: ${call.qualification_status}`);
    
    // Check if lead was created
    const lead = leads?.find(l => l.phone === call.phone_number);
    if (lead) {
      console.log(`   ✅ Lead Created: ${lead.first_name} ${lead.last_name || ''}`);
      console.log(`      Lead Status: ${lead.status}`);
      console.log(`      Lead Score: ${lead.score}`);
    } else {
      console.log(`   ❌ No Lead Created`);
    }
    
    // Show transcript excerpt
    if (call.transcript) {
      const excerpt = call.transcript.substring(0, 200);
      console.log(`   Transcript excerpt: "${excerpt}..."`);
    }
    
    console.log('');
  }

  // Show which calls were declined
  console.log('❌ Calls that were DECLINED by AI:\n');
  const declinedCalls = calls?.filter(c => c.ai_recommendation === 'decline');
  
  for (const call of declinedCalls || []) {
    console.log(`- ${call.customer_name} (${call.phone_number})`);
    console.log(`  Reason: ${call.ai_confidence_score * 100}% confidence, ${call.sentiment} sentiment`);
    
    // Check if a lead was mistakenly created
    const lead = leads?.find(l => l.phone === call.phone_number);
    if (lead) {
      console.log(`  ⚠️  WARNING: Lead was created despite AI decline recommendation!`);
    }
  }

  // Analyze Sanya specifically
  console.log('\n🔍 Special Analysis - Sanya\'s Call:');
  const sanyaCall = calls?.find(c => c.customer_name === 'Sanya');
  if (sanyaCall) {
    console.log('Call Details:');
    console.log(`- AI Score: ${sanyaCall.ai_confidence_score * 100}%`);
    console.log(`- Recommendation: ${sanyaCall.ai_recommendation}`);
    console.log(`- Summary: ${sanyaCall.summary}`);
    
    const sanyaLead = leads?.find(l => l.first_name === 'Sanya');
    if (sanyaLead) {
      console.log('\nLead was created because:');
      console.log(`- Lead created on: ${new Date(sanyaLead.created_at).toLocaleString()}`);
      console.log(`- Lead source: ${sanyaLead.lead_source || 'Unknown'}`);
      console.log(`- Lead notes: ${sanyaLead.notes || 'None'}`);
      
      // This lead might have been created manually or before AI processing
      if (sanyaCall.created_at > sanyaLead.created_at) {
        console.log('⚠️  Lead was created BEFORE the AI analysis!');
      }
    }
  }
}

analyzeLeadDecisions().then(() => process.exit(0));