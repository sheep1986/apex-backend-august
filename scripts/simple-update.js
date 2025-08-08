const supabase = require('../services/supabase-client').default;

async function updateLead() {
  console.log('Updating lead...');
  
  // Get the lead
  const { data: leads, error: fetchError } = await supabase
    .from('leads')
    .select('*')
    .eq('phone', '+35677161714');
  
  if (fetchError) {
    console.error('Fetch error:', fetchError);
    return;
  }
  
  if (!leads || leads.length === 0) {
    console.log('Lead not found');
    return;
  }
  
  const lead = leads[0];
  console.log('Found lead:', lead.first_name, 'ID:', lead.id);
  
  // Only update fields we know exist
  const updates = {
    email: 'matt@techsolutions.com',
    company: 'Tech Solutions Ltd',
    status: 'qualified',
    score: 85,
    updated_at: new Date().toISOString()
  };
  
  const { error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', lead.id);
  
  if (error) {
    console.error('Update error:', error);
  } else {
    console.log('✅ Successfully updated lead with:');
    console.log('   Email:', updates.email);
    console.log('   Company:', updates.company);
    console.log('   Status:', updates.status);
    console.log('   Score:', updates.score);
    console.log('\nPlease refresh the CRM page to see the changes!');
  }
  
  process.exit(0);
}

updateLead().catch(console.error);