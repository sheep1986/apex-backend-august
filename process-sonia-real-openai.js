const OpenAI = require('openai');
const supabase = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize clients
const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseServiceKey);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function analyzeCallWithOpenAI(transcript) {
  const prompt = `
You are an expert sales call analyst. Analyze this call transcript and extract comprehensive lead qualification data.

CALL TRANSCRIPT:
${transcript}

ANALYSIS REQUIREMENTS:
Provide a detailed JSON response with the following structure:

{
  "leadQuality": "hot|warm|cold|unqualified",
  "confidenceScore": 0.95,
  "keyInsights": ["key insight 1", "key insight 2"],
  "contactInfo": {
    "firstName": "extracted first name",
    "lastName": "extracted last name", 
    "phone": "extracted phone if mentioned",
    "email": "extracted email if mentioned",
    "company": "extracted company if mentioned",
    "address": "extracted address if mentioned"
  },
  "leadData": {
    "interestLevel": 8,
    "budget": "high|medium|low|unknown",
    "timeline": "immediate|short|medium|long|unknown",
    "decisionMaker": true,
    "painPoints": ["pain point 1", "pain point 2"],
    "nextSteps": "description of agreed next steps"
  },
  "qualification": {
    "qualified": true,
    "reason": "clear explanation of qualification decision",
    "followUpRequired": true,
    "priority": "high|medium|low"
  }
}

SCORING CRITERIA:
- HOT: Immediate interest, budget confirmed, appointment scheduled, decision maker
- WARM: Strong interest, some budget indication, timeline discussed
- COLD: Mild interest, unclear budget/timeline, needs nurturing
- UNQUALIFIED: No interest, no budget, not decision maker, do not call requests

Interest Level (1-10):
- 10: Ready to buy now, appointment scheduled
- 8-9: Very interested, discussing specifics
- 6-7: Interested but needs more information
- 4-5: Mild interest, exploring options
- 1-3: Little to no interest

Extract ALL mentioned contact details, pain points, objections, and next steps from the conversation.
`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system", 
          content: "You are an expert sales call analyst. Always respond with valid JSON only, no additional text or formatting."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 1500
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from OpenAI');
    }

    return JSON.parse(response);

  } catch (error) {
    console.error('❌ OpenAI analysis failed:', error);
    throw error;
  }
}

async function processSoniaCallWithRealOpenAI() {
  console.log('🔍 Processing Sonia call with REAL OpenAI analysis...\n');

  try {
    // Get the call data
    const { data: call, error } = await supabaseClient
      .from('calls')
      .select('*')
      .eq('id', 'e21ca2b5-9f7d-43ac-baa2-2657811ebfcf')
      .single();

    if (error || !call) {
      console.error('❌ Call not found:', error);
      return;
    }

    console.log('📞 Found call:', call.id);
    console.log('📝 Transcript length:', call.transcript?.length || 0);
    console.log('🤖 Analyzing with OpenAI GPT-4o-mini...\n');

    // Analyze with real OpenAI
    const analysis = await analyzeCallWithOpenAI(call.transcript);

    console.log('✅ OpenAI Analysis completed!');
    console.log('🎯 Lead Quality:', analysis.leadQuality);
    console.log('📊 Confidence:', Math.round(analysis.confidenceScore * 100) + '%');
    console.log('⭐ Interest Level:', analysis.leadData.interestLevel + '/10');
    console.log('✅ Qualified:', analysis.qualification.qualified);
    console.log('🔥 Priority:', analysis.qualification.priority);

    console.log('\n🧠 AI Key Insights:');
    analysis.keyInsights.forEach((insight, i) => {
      console.log(`  ${i + 1}. ${insight}`);
    });

    console.log('\n👤 Contact Information:');
    console.log('  Name:', analysis.contactInfo.firstName, analysis.contactInfo.lastName);
    console.log('  Phone:', analysis.contactInfo.phone);
    console.log('  Address:', analysis.contactInfo.address);

    console.log('\n💡 Lead Data:');
    console.log('  Budget:', analysis.leadData.budget);
    console.log('  Timeline:', analysis.leadData.timeline);
    console.log('  Decision Maker:', analysis.leadData.decisionMaker);
    console.log('  Next Steps:', analysis.leadData.nextSteps);

    // Create/update contact in database
    const contactData = {
      organization_id: call.organization_id,
      first_name: analysis.contactInfo.firstName,
      last_name: analysis.contactInfo.lastName || '',
      email: analysis.contactInfo.email,
      phone: analysis.contactInfo.phone,
      company: analysis.contactInfo.company,
      job_title: null,
      source: 'ai_voice_call',
      tags: [
        'ai_qualified',
        'openai_analyzed',
        analysis.leadQuality,
        `interest_${analysis.leadData.interestLevel}`,
        analysis.qualification.priority + '_priority'
      ],
      notes: `🤖 AI Qualified Lead from OpenAI Analysis

🧠 Key Insights:
${analysis.keyInsights.map(insight => `• ${insight}`).join('\n')}

💔 Pain Points:
${analysis.leadData.painPoints.map(point => `• ${point}`).join('\n')}

🎯 Next Steps: ${analysis.leadData.nextSteps}

📍 Address: ${analysis.contactInfo.address}
📊 AI Confidence Score: ${Math.round(analysis.confidenceScore * 100)}%
⭐ Interest Level: ${analysis.leadData.interestLevel}/10
💰 Budget: ${analysis.leadData.budget}
⏰ Timeline: ${analysis.leadData.timeline}
👥 Decision Maker: ${analysis.leadData.decisionMaker ? 'Yes' : 'No'}`,
      status: analysis.qualification.qualified ? 'qualified' : 'unqualified',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Check if contact already exists
    const { data: existingContact } = await supabaseClient
      .from('contacts')
      .select('id')
      .eq('phone', contactData.phone)
      .eq('organization_id', contactData.organization_id)
      .single();

    let contact;
    if (existingContact) {
      // Update existing
      const { data, error: updateError } = await supabaseClient
        .from('contacts')
        .update(contactData)
        .eq('id', existingContact.id)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Error updating contact:', updateError);
        return;
      }
      contact = data;
      console.log('\n✅ Updated existing contact with OpenAI analysis:', contact.first_name);
    } else {
      // Create new
      const { data, error: createError } = await supabaseClient
        .from('contacts')
        .insert(contactData)
        .select()
        .single();

      if (createError) {
        console.error('❌ Error creating contact:', createError);
        return;
      }
      contact = data;
      console.log('\n✅ Created new contact with OpenAI analysis:', contact.first_name);
    }

    // Update call record
    await supabaseClient
      .from('calls')
      .update({
        ai_confidence_score: analysis.confidenceScore,
        human_review_required: analysis.qualification.followUpRequired,
        updated_at: new Date().toISOString()
      })
      .eq('id', call.id);

    console.log('\n🎉 OpenAI Analysis & Contact Creation Completed!');
    console.log('📧 Contact ID:', contact.id);
    console.log('📊 Contact Status:', contact.status);
    console.log('🏷️  Tags:', contact.tags);
    console.log('\n🚀 Refresh your CRM to see the OpenAI-analyzed contact!');

  } catch (error) {
    console.error('❌ Error processing call with OpenAI:', error);
    if (error.message?.includes('API key')) {
      console.log('💡 Check your OpenAI API key in the .env file');
    }
  }
}

processSoniaCallWithRealOpenAI().then(() => process.exit(0));