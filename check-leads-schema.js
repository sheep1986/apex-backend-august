const { createClient } = require('@supabase/supabase-js');
const { config } = require('dotenv');

// Load environment variables
config();

async function checkLeadsSchema() {
  console.log('🔍 Checking Leads Table Schema...');
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing environment variables');
    return;
  }
  
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Try to select all columns with LIMIT 0
    console.log('🔍 Checking available columns...');
    const { data: sampleData, error: selectError } = await supabase
      .from('leads')
      .select('*')
      .limit(1);
    
    if (selectError) {
      console.error('❌ Select failed:', selectError);
    } else {
      console.log('✅ Sample data retrieved');
      if (sampleData && sampleData.length > 0) {
        console.log('Available columns:', Object.keys(sampleData[0]));
      } else {
        console.log('No data in table, trying to insert minimal record...');
        
        // Try minimal insert with organization_id
        const { data: insertData, error: insertError } = await supabase
          .from('leads')
          .insert([{
            first_name: 'Test',
            last_name: 'Schema',
            email: 'schema-test@example.com',
            organization_id: '550e8400-e29b-41d4-a716-446655440000'
          }])
          .select();
        
        if (insertError) {
          console.error('❌ Minimal insert failed:', insertError.message);
          console.error('Full error:', insertError);
        } else {
          console.log('✅ Minimal insert succeeded');
          console.log('Available columns:', Object.keys(insertData[0]));
          
          // Clean up the test record
          await supabase
            .from('leads')
            .delete()
            .eq('email', 'schema-test@example.com');
          console.log('🧹 Test record cleaned up');
        }
      }
    }
    
    // Also check what we can insert by trying different fields
    console.log('\n🔍 Testing field requirements...');
    const testFields = [
      { name: 'priority', value: 'high' },
      { name: 'status', value: 'new' },
      { name: 'source', value: 'test' },
      { name: 'phone', value: '+1234567890' },
      { name: 'company', value: 'Test Company' }
    ];
    
    for (const field of testFields) {
      const testRecord = {
        first_name: 'Test',
        last_name: 'Field',
        email: `test-${field.name}@example.com`,
        organization_id: '550e8400-e29b-41d4-a716-446655440000',
        [field.name]: field.value
      };
      
      const { data: testData, error: testError } = await supabase
        .from('leads')
        .insert([testRecord])
        .select();
      
      if (testError) {
        console.log(`❌ Field '${field.name}' not supported: ${testError.message}`);
      } else {
        console.log(`✅ Field '${field.name}' supported`);
        // Clean up
        await supabase
          .from('leads')
          .delete()
          .eq('email', `test-${field.name}@example.com`);
      }
    }
    
  } catch (error) {
    console.error('❌ Schema check failed:', error.message);
  }
}

// Run the check
checkLeadsSchema(); 