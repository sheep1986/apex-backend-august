const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://twigokrtbvigiqnaybfy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTEzNTI2OSwiZXhwIjoyMDY2NzExMjY5fQ.QXMRS8ygWhy_oExRD9FX3HNcdKQZEQ2eH7bGu-q6bZg';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCampaignsSchema() {
  console.log('🔍 Checking Campaigns Table Schema...');
  
  try {
    // Check campaigns table columns
    console.log('🔍 Checking available columns...');
    const { data: sampleData, error } = await supabase
      .from('campaigns')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('❌ Error fetching campaigns:', error);
      return;
    }
    
    console.log('✅ Sample data retrieved');
    if (sampleData && sampleData.length > 0) {
      console.log('Available columns:', Object.keys(sampleData[0]));
    } else {
      console.log('⚠️ No campaigns found, getting table structure...');
      
      // Try to get table structure by doing a failed insert
      const { error: insertError } = await supabase
        .from('campaigns')
        .insert({
          id: 'test-id-12345',
          name: 'Test Campaign',
          // Try some fields that might exist
          assistant_id: 'test-assistant',
          phone_number_id: 'test-phone',
          vapi_campaign_id: 'test-vapi'
        });
      
      console.log('Insert error (expected):', insertError);
    }
    
    // Test specific columns we're looking for
    const requiredColumns = ['assistant_id', 'phone_number_id', 'vapi_campaign_id'];
    
    console.log('\n🔍 Testing required columns...');
    for (const column of requiredColumns) {
      try {
        const { error: testError } = await supabase
          .from('campaigns')
          .select(column)
          .limit(1);
        
        if (testError) {
          console.log(`❌ Column '${column}' not supported:`, testError.message);
        } else {
          console.log(`✅ Column '${column}' exists`);
        }
      } catch (err) {
        console.log(`❌ Column '${column}' test failed:`, err.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking campaigns schema:', error);
  }
}

checkCampaignsSchema().then(() => {
  console.log('\n✅ Campaigns schema check completed');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
}); 