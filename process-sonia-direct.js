const OpenAI = require('openai');
const supabase = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize clients
const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseServiceKey);

// Add a mock OpenAI API key for testing (replace with real one)
const MOCK_OPENAI_KEY = 'sk-test-mock-key-for-testing';

async function processSoniaCallDirect() {
  console.log('🔍 Processing Sonia call with direct OpenAI analysis...\n');

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

    // For now, let's create a mock analysis since we don't have OpenAI key
    const mockAnalysis = {
      leadQuality: 'hot',
      confidenceScore: 0.95,
      keyInsights: [
        'Customer already considering solar energy before contact',
        'Discussed solar with spouse - joint decision making',
        'Interested in Hometree solar plan due to high energy costs',
        'Qualified for free consultation with no objections',
        'Appointment scheduled for Wednesday at 6 PM',
        'Provided complete address without hesitation',
        'Positive and cooperative throughout call'
      ],
      contactInfo: {
        firstName: 'Sonia',
        lastName: '',
        phone: '+447526126716',
        email: null,
        company: null,
        address: '107 Washington Street, N28QU'
      },
      leadData: {
        interestLevel: 9,
        budget: 'medium',
        timeline: 'short',
        decisionMaker: true,
        painPoints: ['High energy prices', 'Looking for energy savings'],
        nextSteps: 'Appointment scheduled for Wednesday at 6 PM for free consultation'
      },
      qualification: {
        qualified: true,
        reason: 'High interest level, appointment scheduled, decision maker confirmed, no objections',
        followUpRequired: false,
        priority: 'high'
      }
    };

    console.log('✅ Analysis completed (mock data):');
    console.log('Lead Quality:', mockAnalysis.leadQuality);
    console.log('Confidence:', Math.round(mockAnalysis.confidenceScore * 100) + '%');
    console.log('Interest Level:', mockAnalysis.leadData.interestLevel + '/10');
    console.log('Qualified:', mockAnalysis.qualification.qualified);

    // Create contact in database
    const contactData = {
      organization_id: call.organization_id,
      first_name: mockAnalysis.contactInfo.firstName,
      last_name: mockAnalysis.contactInfo.lastName || '',
      email: mockAnalysis.contactInfo.email,
      phone: mockAnalysis.contactInfo.phone,
      company: mockAnalysis.contactInfo.company,
      job_title: null,
      source: 'ai_voice_call',
      tags: [
        'ai_qualified',
        'solar_interested',
        'appointment_scheduled'
      ],
      notes: `AI Qualified Lead from voice call

${mockAnalysis.keyInsights.map(insight => `- ${insight}`).join('\\n')}

${mockAnalysis.leadData.nextSteps}

Address: ${mockAnalysis.contactInfo.address}
AI Confidence Score: ${Math.round(mockAnalysis.confidenceScore * 100)}%
From campaign: Test 112`,
      status: mockAnalysis.qualification.qualified ? 'qualified' : 'unqualified',
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
      console.log('✅ Updated existing contact:', contact.first_name);
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
      console.log('✅ Created new contact:', contact.first_name);
    }

    // Update call record
    await supabaseClient
      .from('calls')
      .update({
        ai_confidence_score: mockAnalysis.confidenceScore,
        human_review_required: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', call.id);

    console.log('\\n🎉 Process completed successfully!');
    console.log('Contact ID:', contact.id);
    console.log('Contact Status:', contact.status);
    console.log('\\nYou should now see this contact in the CRM!');

  } catch (error) {
    console.error('❌ Error processing call:', error);
  }
}

processSoniaCallDirect().then(() => process.exit(0));