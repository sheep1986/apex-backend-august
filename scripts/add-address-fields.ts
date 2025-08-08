import supabase from '../services/supabase-client';

async function addAddressFields() {
  console.log('🔧 Adding address fields to leads table...');
  
  try {
    // First, let's add the individual address fields that the frontend expects
    const alterStatements = [
      "ALTER TABLE leads ADD COLUMN IF NOT EXISTS address_line1 TEXT",
      "ALTER TABLE leads ADD COLUMN IF NOT EXISTS city TEXT",
      "ALTER TABLE leads ADD COLUMN IF NOT EXISTS state TEXT",
      "ALTER TABLE leads ADD COLUMN IF NOT EXISTS postal_code TEXT",
      "ALTER TABLE leads ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'United States'",
      "ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT",
      "ALTER TABLE leads ADD COLUMN IF NOT EXISTS company TEXT",
      "ALTER TABLE leads ADD COLUMN IF NOT EXISTS job_title TEXT",
      "ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT"
    ];
    
    for (const sql of alterStatements) {
      console.log(`\n📝 Executing: ${sql}`);
      
      // Use raw SQL through Supabase
      const { error } = await supabase.rpc('exec_sql', { 
        sql_query: sql 
      });
      
      if (error) {
        console.log(`   ⚠️ Could not execute (may already exist): ${error.message}`);
      } else {
        console.log(`   ✅ Success`);
      }
    }
    
    // Now update Matt's lead with address data
    console.log('\n📍 Updating Matt\'s lead with address information...');
    
    const updates = {
      email: 'matt@techsolutions.com',
      company: 'Tech Solutions Ltd',
      job_title: 'Operations Manager',
      address_line1: '123 Business Park',
      city: 'Valletta',
      state: 'Malta',
      postal_code: 'VLT 1234',
      country: 'Malta',
      notes: 'High-interest lead from Malta. Interested in AI calling solutions.',
      status: 'qualified',
      score: 85,
      updated_at: new Date().toISOString()
    };
    
    const { error: updateError } = await supabase
      .from('leads')
      .update(updates)
      .eq('phone', '+35677161714');
    
    if (updateError) {
      console.error('❌ Update error:', updateError);
    } else {
      console.log('✅ Lead updated with address and contact information!');
      console.log('\n📋 Updated fields:');
      console.log('   Address:', `${updates.address_line1}, ${updates.city}, ${updates.state} ${updates.postal_code}, ${updates.country}`);
      console.log('   Email:', updates.email);
      console.log('   Company:', updates.company);
      console.log('   Position:', updates.job_title);
    }
    
  } catch (error) {
    console.error('❌ Script error:', error);
  }
}

console.log('🚀 Starting address fields addition script');
addAddressFields()
  .then(() => {
    console.log('\n✅ Script complete! Please refresh the CRM page to see the address information.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });