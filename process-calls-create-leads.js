const supabase = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function analyzeCallWithOpenAI(transcript, duration, customerName) {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not set');
    return null;
  }

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are an AI that analyzes sales call transcripts to determine lead quality. 
            Analyze the transcript and provide:
            1. A confidence score (0-1) of how likely this is a qualified lead
            2. Key buying signals found
            3. A brief summary
            4. Recommendation: accept, decline, or review`
          },
          {
            role: 'user',
            content: `Analyze this ${duration} second call transcript:
            
Customer: ${customerName}
Transcript:
${transcript}

Provide your analysis in JSON format:
{
  "confidenceScore": 0.0-1.0,
  "buyingSignals": ["signal1", "signal2"],
  "summary": "brief summary",
  "recommendation": "accept|decline|review",
  "sentiment": "positive|neutral|negative"
}`
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const content = response.data.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    console.error('❌ OpenAI API error:', error.response?.data || error.message);
    return null;
  }
}

async function processCallsAndCreateLeads() {
  console.log('🤖 Processing calls with OpenAI and creating leads...\n');

  // Get calls with transcripts
  const { data: calls } = await client
    .from('calls')
    .select('*')
    .not('transcript', 'is', null)
    .gt('duration', 30) // Only calls longer than 30 seconds
    .order('created_at', { ascending: false })
    .limit(5);

  console.log(`Found ${calls?.length || 0} calls to process:\n`);

  for (const call of calls || []) {
    console.log(`\n📞 Processing: ${call.customer_name || 'Unknown'}`);
    console.log(`   Duration: ${call.duration}s`);
    console.log(`   Phone: ${call.phone_number}`);
    
    // Analyze with OpenAI
    const analysis = await analyzeCallWithOpenAI(
      call.transcript,
      call.duration,
      call.customer_name
    );

    if (!analysis) {
      console.log('   ❌ Analysis failed');
      continue;
    }

    console.log(`   📊 AI Analysis:`);
    console.log(`      Confidence: ${(analysis.confidenceScore * 100).toFixed(0)}%`);
    console.log(`      Recommendation: ${analysis.recommendation}`);
    console.log(`      Buying Signals: ${analysis.buyingSignals.length}`);

    // Update call with AI analysis
    await client
      .from('calls')
      .update({
        ai_confidence_score: analysis.confidenceScore,
        ai_recommendation: analysis.recommendation,
        sentiment: analysis.sentiment,
        summary: analysis.summary,
        buying_signals: analysis.buyingSignals.join(', '),
        qualification_status: analysis.confidenceScore >= 0.8 ? 'auto_accepted' : 
                            analysis.confidenceScore < 0.3 ? 'auto_declined' : 'pending',
        updated_at: new Date().toISOString()
      })
      .eq('id', call.id);

    // Create lead if high confidence
    if (analysis.confidenceScore >= 0.7 && analysis.recommendation === 'accept') {
      console.log('   🎯 Creating lead...');
      
      // Check if lead already exists
      const { data: existingLead } = await client
        .from('leads')
        .select('id')
        .eq('phone', call.phone_number)
        .single();

      if (!existingLead) {
        const nameParts = (call.customer_name || '').split(' ');
        const { data: newLead, error } = await client
          .from('leads')
          .insert({
            organization_id: call.organization_id,
            campaign_id: call.campaign_id,
            first_name: nameParts[0] || 'Unknown',
            last_name: nameParts.slice(1).join(' ') || '',
            phone: call.phone_number,
            status: 'qualified',
            score: Math.round(analysis.confidenceScore * 100),
            lead_source: 'ai_call_analysis',
            lead_quality: analysis.confidenceScore >= 0.9 ? 'hot' : 
                         analysis.confidenceScore >= 0.7 ? 'warm' : 'cold',
            notes: analysis.summary,
            custom_fields: {
              ai_confidence: analysis.confidenceScore,
              buying_signals: analysis.buyingSignals,
              call_duration: call.duration,
              call_id: call.id
            },
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (error) {
          console.error('   ❌ Error creating lead:', error);
        } else {
          console.log(`   ✅ Lead created: ${newLead.id}`);
          
          // Mark call as having created lead
          await client
            .from('calls')
            .update({ created_crm_contact: true })
            .eq('id', call.id);
        }
      } else {
        console.log('   ℹ️  Lead already exists');
      }
    }
  }

  // Show final stats
  const { count: totalLeads } = await client
    .from('leads')
    .select('*', { count: 'exact', head: true });
    
  const { count: qualifiedCalls } = await client
    .from('calls')
    .select('*', { count: 'exact', head: true })
    .eq('qualification_status', 'auto_accepted');
    
  console.log('\n📊 Final Statistics:');
  console.log(`   Total Leads: ${totalLeads}`);
  console.log(`   Qualified Calls: ${qualifiedCalls}`);
}

processCallsAndCreateLeads().then(() => process.exit(0));