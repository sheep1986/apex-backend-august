import supabase from '../services/supabase-client';

async function checkLeadStructure() {
  console.log('🔍 Checking lead table structure...');
  
  try {
    // Get Matt's lead
    const { data: leads, error } = await supabase
      .from('leads')
      .select('*')
      .eq('phone', '+35677161714')
      .limit(1);
    
    if (error) {
      console.error('Error:', error);
      return;
    }
    
    if (leads && leads.length > 0) {
      const lead = leads[0];
      console.log('\n📋 Lead found with these fields:');
      Object.keys(lead).forEach(key => {
        const value = lead[key];
        if (value !== null && value !== undefined && value !== '') {
          console.log(`   ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
        }
      });
      
      console.log('\n❓ Missing expected address fields:');
      const expectedFields = ['address_line1', 'city', 'state', 'postal_code', 'country', 'address'];
      expectedFields.forEach(field => {
        if (!(field in lead)) {
          console.log(`   ❌ ${field} - NOT FOUND`);
        } else if (lead[field]) {
          console.log(`   ✅ ${field} - EXISTS with value: ${lead[field]}`);
        }
      });
    }
    
  } catch (error) {
    console.error('Script error:', error);
  }
}

checkLeadStructure().then(() => process.exit(0));