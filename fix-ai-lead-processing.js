const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function analyzeCurrentState() {
  console.log('🔍 Analyzing AI Lead Processing Issues...\n');

  // 1. Check calls with transcripts but no AI processing
  const { data: unprocessedCalls } = await client
    .from('calls')
    .select('id, customer_name, duration, transcript, ai_confidence_score, qualification_status, created_at')
    .not('transcript', 'is', null)
    .is('ai_confidence_score', null)
    .order('created_at', { ascending: false })
    .limit(10);

  console.log(`Found ${unprocessedCalls?.length || 0} calls with transcripts but no AI processing:\n`);
  
  unprocessedCalls?.forEach(call => {
    console.log(`- ${call.customer_name} (${call.id.substring(0, 8)}...)`);
    console.log(`  Duration: ${call.duration}s`);
    console.log(`  Transcript: ${call.transcript ? 'Yes' : 'No'}`);
    console.log(`  AI Score: ${call.ai_confidence_score || 'Not processed'}`);
    console.log(`  Qualification: ${call.qualification_status || 'Not set'}`);
    console.log('');
  });

  // 2. Check if we have leads table
  const { data: leadsTables } = await client
    .from('leads')
    .select('id')
    .limit(1);
    
  console.log(`\n✅ Leads table exists: ${!leadsTables ? 'No' : 'Yes'}`);

  // 3. Check CRM contacts
  const { data: contacts } = await client
    .from('crm_contacts')
    .select('id')
    .limit(5);
    
  console.log(`✅ CRM contacts table exists: ${!contacts ? 'No' : 'Yes'}`);
  console.log(`   Found ${contacts?.length || 0} contacts`);

  // 4. Check if AI processing is configured
  console.log('\n📊 Configuration Check:');
  console.log(`- OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'Set' : 'NOT SET'}`);
  console.log(`- NODE_ENV: ${process.env.NODE_ENV || 'Not set'}`);
  
  // 5. Test AI processing on one call
  if (unprocessedCalls && unprocessedCalls.length > 0) {
    console.log('\n🧪 Testing AI processing on one call...');
    const testCall = unprocessedCalls[0];
    
    try {
      // Import and test the AI processor
      const { processCallWithAI } = require('./services/ai-call-processor');
      console.log('✅ AI processor module loaded successfully');
      
      // Create mock VAPI data
      const mockVapiData = {
        id: testCall.id,
        transcript: testCall.transcript,
        duration: testCall.duration,
        customer: {
          name: testCall.customer_name
        }
      };
      
      console.log(`\nProcessing call ${testCall.id.substring(0, 8)}...`);
      await processCallWithAI(testCall.id, mockVapiData);
      
      // Check if it was processed
      const { data: processed } = await client
        .from('calls')
        .select('ai_confidence_score, qualification_status')
        .eq('id', testCall.id)
        .single();
        
      console.log(`✅ AI Score: ${processed.ai_confidence_score}`);
      console.log(`✅ Qualification: ${processed.qualification_status}`);
      
    } catch (error) {
      console.error('❌ AI processing error:', error.message);
      console.error('Stack:', error.stack);
    }
  }
}

analyzeCurrentState().then(() => process.exit(0));