// Minimal test to isolate the constraint issue
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testMinimalUpdate() {
  console.log('🧪 Testing minimal call update to find constraint issue...');
  
  try {
    // Get a call to test with
    const { data: testCall } = await supabase
      .from('calls')
      .select('id, vapi_call_id')
      .not('vapi_call_id', 'is', null)
      .limit(1)
      .single();
    
    if (!testCall) {
      console.log('❌ No test call found');
      return;
    }
    
    console.log(`📞 Testing with call: ${testCall.vapi_call_id}`);
    
    // Test 1: Just transcript
    console.log('\\n🧪 Test 1: Update transcript only');
    const { error: error1 } = await supabase
      .from('calls')
      .update({ 
        transcript: 'Test transcript update',
        updated_at: new Date().toISOString()
      })
      .eq('id', testCall.id);
    
    if (error1) {
      console.log(`❌ Transcript update failed: ${error1.message}`);
    } else {
      console.log('✅ Transcript update succeeded');
    }
    
    // Test 2: Add recording URL
    console.log('\\n🧪 Test 2: Update recording URL');
    const { error: error2 } = await supabase
      .from('calls')
      .update({ 
        recording_url: 'https://example.com/test.wav',
        updated_at: new Date().toISOString()
      })
      .eq('id', testCall.id);
    
    if (error2) {
      console.log(`❌ Recording update failed: ${error2.message}`);
    } else {
      console.log('✅ Recording update succeeded');
    }
    
    // Test 3: Add outcome
    console.log('\\n🧪 Test 3: Update outcome');
    const { error: error3 } = await supabase
      .from('calls')
      .update({ 
        outcome: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', testCall.id);
    
    if (error3) {
      console.log(`❌ Outcome update failed: ${error3.message}`);
    } else {
      console.log('✅ Outcome update succeeded');
    }
    
    // Test 4: Add cost
    console.log('\\n🧪 Test 4: Update cost');
    const { error: error4 } = await supabase
      .from('calls')
      .update({ 
        cost: 0.05,
        updated_at: new Date().toISOString()
      })
      .eq('id', testCall.id);
    
    if (error4) {
      console.log(`❌ Cost update failed: ${error4.message}`);
    } else {
      console.log('✅ Cost update succeeded');
    }
    
    // Test 5: All together
    console.log('\\n🧪 Test 5: Update all fields together');
    const { error: error5 } = await supabase
      .from('calls')
      .update({ 
        transcript: 'Full test transcript',
        recording_url: 'https://storage.vapi.ai/test.wav',
        outcome: 'completed',
        cost: 0.10,
        duration: 30,
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', testCall.id);
    
    if (error5) {
      console.log(`❌ Full update failed: ${error5.message}`);
      console.log('Error details:', error5);
    } else {
      console.log('✅ Full update succeeded!');
      console.log('\\n🎉 All updates work - the issue might be with specific data values');
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

testMinimalUpdate().catch(console.error);