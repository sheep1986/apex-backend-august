const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function checkAIProcessedLeads() {
  console.log('🔍 Checking AI Processed Calls and Lead Creation...\n');

  // 1. Get recent calls with AI processing
  const { data: aiProcessedCalls } = await client
    .from('calls')
    .select('*')
    .not('ai_confidence_score', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);

  console.log(`Found ${aiProcessedCalls?.length || 0} AI-processed calls:\n`);
  
  const highConfidenceCalls = [];
  
  aiProcessedCalls?.forEach(call => {
    console.log(`📞 ${call.customer_name || 'Unknown'} (${call.phone_number})`);
    console.log(`   Call ID: ${call.id.substring(0, 8)}...`);
    console.log(`   Duration: ${call.duration}s`);
    console.log(`   AI Score: ${(call.ai_confidence_score * 100).toFixed(0)}%`);
    console.log(`   AI Recommendation: ${call.ai_recommendation || 'None'}`);
    console.log(`   Qualification Status: ${call.qualification_status || 'None'}`);
    console.log(`   Created CRM Contact: ${call.created_crm_contact ? 'Yes' : 'No'}`);
    console.log(`   Has Transcript: ${call.transcript ? 'Yes' : 'No'}`);
    console.log('');
    
    if (call.ai_confidence_score >= 0.8) {
      highConfidenceCalls.push(call);
    }
  });

  // 2. Check leads table
  console.log('\n📊 Checking Leads Table:');
  const { data: leads, count } = await client
    .from('leads')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(5);
    
  console.log(`Total leads in database: ${count || 0}\n`);
  
  leads?.forEach(lead => {
    console.log(`👤 ${lead.first_name} ${lead.last_name || ''}`);
    console.log(`   Phone: ${lead.phone}`);
    console.log(`   Status: ${lead.qualification_status || lead.status || 'Unknown'}`);
    console.log(`   Score: ${lead.score || 'N/A'}`);
    console.log(`   Source: ${lead.lead_source || 'Unknown'}`);
    console.log(`   Created: ${new Date(lead.created_at).toLocaleDateString()}`);
    console.log('');
  });

  // 3. Check why high confidence calls didn't create leads
  if (highConfidenceCalls.length > 0 && count === 0) {
    console.log('\n⚠️  Issue Found: High confidence calls exist but no leads created!');
    console.log(`   ${highConfidenceCalls.length} calls with >80% confidence`);
    
    // Check if the createCRMContact function is being called
    const testCall = highConfidenceCalls[0];
    console.log(`\n🧪 Testing lead creation for call ${testCall.id.substring(0, 8)}...`);
    
    try {
      const { AILeadQualificationService } = require('./services/ai-lead-qualification');
      
      // Manually trigger lead creation
      await AILeadQualificationService.createCRMContact(testCall);
      
      // Check if lead was created
      const { data: newLead } = await client
        .from('leads')
        .select('*')
        .eq('phone', testCall.phone_number)
        .single();
        
      if (newLead) {
        console.log('✅ Lead created successfully!');
        console.log(`   Lead ID: ${newLead.id}`);
      } else {
        console.log('❌ Lead creation failed - no error but no lead created');
      }
      
    } catch (error) {
      console.error('❌ Error creating lead:', error.message);
    }
  }

  // 4. Check contacts in CRM
  console.log('\n📊 Checking CRM Contacts:');
  const { data: contacts } = await client
    .from('crm_contacts')
    .select('*')
    .limit(5);
    
  console.log(`Found ${contacts?.length || 0} CRM contacts`);
  
  // 5. Check if there's a table structure issue
  console.log('\n🔧 Checking table structures...');
  
  // Check leads table columns
  const { data: leadsColumns } = await client
    .rpc('get_table_columns', { table_name: 'leads' });
    
  if (leadsColumns) {
    console.log('\nLeads table columns:', leadsColumns.map(c => c.column_name).join(', '));
  }
}

checkAIProcessedLeads().then(() => process.exit(0));