const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Preset qualification fields data
const presetFields = [
  // Appointment & Follow-up
  {
    category: 'appointment',
    field_key: 'appointment_booked',
    field_name: 'Appointment Booked',
    field_type: 'boolean',
    description: 'Prospect agreed to a specific meeting time',
    ai_detection_hints: ['book a meeting', 'schedule a call', 'set up a time', 'calendar', 'appointment', 'demo on', 'meeting on', 'available on', 'how about', 'does * work for you'],
    crm_action: 'calendar_booking',
    scoring_weight: 90,
    display_order: 1
  },
  {
    category: 'appointment',
    field_key: 'callback_requested',
    field_name: 'Callback Requested',
    field_type: 'boolean',
    description: 'Prospect asked to be called back',
    ai_detection_hints: ['call me back', 'callback', 'call back', 'reach me at', 'better time', 'try again', 'call me later', 'not a good time'],
    crm_action: 'task_creation',
    scoring_weight: 30,
    display_order: 2
  },
  {
    category: 'appointment',
    field_key: 'demo_requested',
    field_name: 'Demo Requested',
    field_type: 'boolean',
    description: 'Prospect specifically asked for a demo',
    ai_detection_hints: ['show me', 'see a demo', 'demonstration', 'how it works', 'walk me through', 'see it in action', 'trial', 'try it out'],
    crm_action: 'calendar_booking',
    scoring_weight: 80,
    display_order: 3
  },
  
  // Interest Level
  {
    category: 'interest',
    field_key: 'high_interest_expressed',
    field_name: 'High Interest',
    field_type: 'boolean',
    description: 'Strong buying signals detected',
    ai_detection_hints: ['very interested', 'excited about', 'love to learn', 'definitely need', 'perfect timing', 'exactly what', 'been looking for', 'sign me up'],
    crm_action: 'lead_scoring',
    scoring_weight: 70,
    display_order: 4
  },
  {
    category: 'interest',
    field_key: 'asking_detailed_questions',
    field_name: 'Asking Questions',
    field_type: 'boolean',
    description: 'Prospect engaged with specific questions',
    ai_detection_hints: ['how does', 'what about', 'can you explain', 'tell me more', 'specifically', 'pricing', 'cost', 'implementation', 'features', 'integration'],
    crm_action: 'lead_scoring',
    scoring_weight: 50,
    display_order: 5
  },
  {
    category: 'interest',
    field_key: 'use_case_mentioned',
    field_name: 'Use Case Mentioned',
    field_type: 'text',
    description: 'Specific use case or need expressed',
    ai_detection_hints: ['we need', 'looking for', 'trying to', 'want to', 'goal is', 'help us', 'solve', 'improve', 'automate'],
    crm_action: 'tag_assignment',
    scoring_weight: 60,
    display_order: 6
  },
  
  // Timeline
  {
    category: 'timeline',
    field_key: 'urgent_need',
    field_name: 'Urgent Need',
    field_type: 'boolean',
    description: 'Immediate or urgent timeline mentioned',
    ai_detection_hints: ['asap', 'urgent', 'immediately', 'right away', 'this week', 'this month', 'quickly', 'fast', 'soon as possible'],
    crm_action: 'lead_scoring',
    scoring_weight: 85,
    display_order: 7
  },
  {
    category: 'timeline',
    field_key: 'timeline_mentioned',
    field_name: 'Timeline Mentioned',
    field_type: 'text',
    description: 'Specific timeline for decision/implementation',
    ai_detection_hints: ['by end of', 'quarter', 'month', 'fiscal year', 'budget cycle', 'planning to', 'timeline', 'timeframe', 'when'],
    crm_action: 'lead_scoring',
    scoring_weight: 40,
    display_order: 8
  },
  
  // Budget & Authority
  {
    category: 'budget',
    field_key: 'budget_mentioned',
    field_name: 'Budget Mentioned',
    field_type: 'boolean',
    description: 'Discussed budget or pricing',
    ai_detection_hints: ['budget', 'pricing', 'cost', 'afford', 'invest', 'spend', 'price range', 'expensive', 'cheap', 'roi', 'payback'],
    crm_action: 'lead_scoring',
    scoring_weight: 65,
    display_order: 9
  },
  {
    category: 'budget',
    field_key: 'budget_amount',
    field_name: 'Budget Amount',
    field_type: 'text',
    description: 'Specific budget range or amount mentioned',
    ai_detection_hints: ['dollars', 'per month', 'per year', 'annual', 'monthly', 'thousand', 'million', '$', 'k per'],
    crm_action: 'tag_assignment',
    scoring_weight: 75,
    display_order: 10
  },
  {
    category: 'authority',
    field_key: 'decision_maker',
    field_name: 'Decision Maker',
    field_type: 'boolean',
    description: 'Speaking with decision maker',
    ai_detection_hints: ['i decide', 'my decision', 'i approve', 'i can sign', 'owner', 'ceo', 'president', 'director', 'manager', 'head of', 'in charge'],
    crm_action: 'lead_scoring',
    scoring_weight: 70,
    display_order: 11
  },
  {
    category: 'authority',
    field_key: 'influencer',
    field_name: 'Influencer',
    field_type: 'boolean',
    description: 'Has influence on decision',
    ai_detection_hints: ['recommend', 'my boss', 'team decision', 'committee', 'present to', 'make the case', 'influence', 'input'],
    crm_action: 'lead_scoring',
    scoring_weight: 45,
    display_order: 12
  },
  
  // Pain Points & Needs
  {
    category: 'pain_point',
    field_key: 'current_pain_mentioned',
    field_name: 'Pain Point Mentioned',
    field_type: 'text',
    description: 'Specific problem or challenge expressed',
    ai_detection_hints: ['problem', 'issue', 'challenge', 'struggling', 'difficult', 'frustrated', 'pain', 'annoying', 'waste', 'inefficient', 'manual'],
    crm_action: 'tag_assignment',
    scoring_weight: 55,
    display_order: 13
  },
  {
    category: 'pain_point',
    field_key: 'feature_request',
    field_name: 'Feature Request',
    field_type: 'text',
    description: 'Specific features or capabilities requested',
    ai_detection_hints: ['need it to', 'must have', 'looking for', 'important that', 'require', 'essential', 'critical', 'key feature'],
    crm_action: 'tag_assignment',
    scoring_weight: 50,
    display_order: 14
  },
  
  // Competitor Information
  {
    category: 'competitor',
    field_key: 'using_competitor',
    field_name: 'Using Competitor',
    field_type: 'boolean',
    description: 'Currently using a competitor solution',
    ai_detection_hints: ['currently using', 'already have', 'switching from', 'looking to replace', 'not happy with', 'comparing', 'alternative'],
    crm_action: 'tag_assignment',
    scoring_weight: 60,
    display_order: 15
  },
  {
    category: 'competitor',
    field_key: 'competitor_name',
    field_name: 'Competitor Name',
    field_type: 'text',
    description: 'Specific competitor mentioned',
    ai_detection_hints: ['salesforce', 'hubspot', 'pipedrive', 'zoho', 'microsoft', 'competitor specific names'],
    crm_action: 'tag_assignment',
    scoring_weight: 40,
    display_order: 16
  },
  
  // Contact Information
  {
    category: 'contact_info',
    field_key: 'email_provided',
    field_name: 'Email Provided',
    field_type: 'boolean',
    description: 'Prospect shared email address',
    ai_detection_hints: ['email is', 'email me', 'send it to', '@', '.com', 'reach me at'],
    crm_action: 'lead_scoring',
    scoring_weight: 70,
    display_order: 17
  },
  {
    category: 'contact_info',
    field_key: 'best_time_to_call',
    field_name: 'Best Time to Call',
    field_type: 'text',
    description: 'Preferred contact time mentioned',
    ai_detection_hints: ['best time', 'call me', 'morning', 'afternoon', 'evening', 'timezone', 'available', 'reach me'],
    crm_action: 'task_creation',
    scoring_weight: 30,
    display_order: 18
  },
  {
    category: 'contact_info',
    field_key: 'preferred_contact_method',
    field_name: 'Preferred Contact',
    field_type: 'select',
    description: 'How they prefer to be contacted',
    ai_detection_hints: ['prefer email', 'text me', 'call me', 'whatsapp', 'linkedin', 'prefer'],
    crm_action: 'tag_assignment',
    scoring_weight: 25,
    display_order: 19,
    options: {
      choices: ['email', 'phone', 'text', 'whatsapp', 'linkedin']
    }
  },
  
  // Company Information
  {
    category: 'company',
    field_key: 'company_size_mentioned',
    field_name: 'Company Size',
    field_type: 'text',
    description: 'Number of employees or company size',
    ai_detection_hints: ['employees', 'people', 'team size', 'company size', 'headcount', 'staff', 'users'],
    crm_action: 'lead_scoring',
    scoring_weight: 40,
    display_order: 20
  },
  {
    category: 'company',
    field_key: 'industry_mentioned',
    field_name: 'Industry',
    field_type: 'text',
    description: 'Industry or vertical mentioned',
    ai_detection_hints: ['industry', 'business', 'sector', 'market', 'space', 'vertical'],
    crm_action: 'tag_assignment',
    scoring_weight: 30,
    display_order: 21
  },
  {
    category: 'company',
    field_key: 'growth_mentioned',
    field_name: 'Growth Stage',
    field_type: 'boolean',
    description: 'Mentioned growth or scaling',
    ai_detection_hints: ['growing', 'scaling', 'expanding', 'hiring', 'new market', 'growth', 'increase'],
    crm_action: 'lead_scoring',
    scoring_weight: 50,
    display_order: 22
  }
];

async function insertPresetFields() {
  console.log('🚀 Inserting preset qualification fields...\n');

  try {
    // First, check if any fields already exist
    const { data: existingFields, error: checkError } = await supabase
      .from('qualification_field_presets')
      .select('field_key');

    if (checkError) {
      console.error('❌ Error checking existing fields:', checkError);
      return;
    }

    const existingKeys = existingFields.map(f => f.field_key);
    console.log(`📊 Found ${existingKeys.length} existing fields\n`);

    // Filter out existing fields
    const fieldsToInsert = presetFields.filter(field => !existingKeys.includes(field.field_key));

    if (fieldsToInsert.length === 0) {
      console.log('✅ All preset fields already exist!');
      return;
    }

    console.log(`📝 Inserting ${fieldsToInsert.length} new fields...\n`);

    // Insert fields in batches
    const batchSize = 5;
    for (let i = 0; i < fieldsToInsert.length; i += batchSize) {
      const batch = fieldsToInsert.slice(i, i + batchSize);
      
      const { data, error } = await supabase
        .from('qualification_field_presets')
        .insert(batch)
        .select();

      if (error) {
        console.error(`❌ Error inserting batch ${Math.floor(i/batchSize) + 1}:`, error);
      } else {
        console.log(`✅ Inserted batch ${Math.floor(i/batchSize) + 1}: ${batch.map(f => f.field_key).join(', ')}`);
      }
    }

    // Verify final count
    const { data: finalCount } = await supabase
      .from('qualification_field_presets')
      .select('category, field_key');

    if (finalCount) {
      console.log('\n📊 Final field count by category:');
      const categoryCounts = finalCount.reduce((acc, row) => {
        acc[row.category] = (acc[row.category] || 0) + 1;
        return acc;
      }, {});

      Object.entries(categoryCounts).forEach(([category, count]) => {
        console.log(`  - ${category}: ${count} fields`);
      });

      console.log(`\n✅ Total fields: ${finalCount.length}`);
    }

    // Also add the winning_criteria column to campaigns
    console.log('\n📝 Adding winning_criteria column to campaigns table...');
    
    const { data: testCampaign, error: columnError } = await supabase
      .from('campaigns')
      .select('id, winning_criteria')
      .limit(1);

    if (columnError && columnError.message.includes('column') && columnError.message.includes('does not exist')) {
      console.log('\n⚠️  winning_criteria column still needs to be added manually:');
      console.log('   Run this SQL in Supabase dashboard:');
      console.log('   ALTER TABLE campaigns ADD COLUMN winning_criteria JSONB DEFAULT \'{}\'::jsonb;');
    } else {
      console.log('✅ winning_criteria column already exists!');
    }

    console.log('\n✨ Preset fields setup complete!');
    console.log('\nNext steps:');
    console.log('1. Add winning_criteria column if needed (see above)');
    console.log('2. Integrate QualificationFieldsStep into campaign wizard');
    console.log('3. Update AI processor to use these fields');

  } catch (error) {
    console.error('💥 Fatal error:', error);
  }
}

insertPresetFields();