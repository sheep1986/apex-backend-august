const supabase = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';
const client = supabase.createClient(supabaseUrl, supabaseServiceKey);

async function testWinningCriteria() {
  console.log('🔧 Testing winning_criteria field...\n');

  // Try to update a campaign with winning criteria
  const testCriteria = {
    mainCriteria: "Looking for businesses with 10+ employees who need automation",
    minDuration: 30,
    autoAcceptScore: 80,
    requireCompanySize: true,
    minCompanySize: 10,
    requireBudget: false,
    requireGrowthIntent: true,
    disqualifiers: "Already a customer\nCompetitor employee"
  };

  // Get a campaign to test with
  const { data: campaigns } = await client
    .from('campaigns')
    .select('id, name')
    .limit(1);

  if (campaigns && campaigns.length > 0) {
    const campaign = campaigns[0];
    console.log(`Testing with campaign: ${campaign.name}`);

    // Try to update with winning criteria
    const { data, error } = await client
      .from('campaigns')
      .update({ 
        winning_criteria: testCriteria,
        updated_at: new Date().toISOString()
      })
      .eq('id', campaign.id)
      .select();

    if (error) {
      console.error('❌ Error updating campaign:', error);
      console.log('\n⚠️  The winning_criteria column may not exist yet.');
      console.log('Please add it manually in Supabase dashboard:');
      console.log('1. Go to Table Editor > campaigns');
      console.log('2. Add new column:');
      console.log('   - Name: winning_criteria');
      console.log('   - Type: jsonb');
      console.log('   - Default: {}');
    } else {
      console.log('✅ Successfully updated campaign with winning criteria!');
      console.log('Data:', data[0].winning_criteria);
    }
  } else {
    console.log('No campaigns found to test with');
  }
}

testWinningCriteria().then(() => process.exit(0));