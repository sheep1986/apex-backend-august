import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config({ path: '../.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixCallDurationAndCost() {
  console.log('🔍 Fetching calls with missing duration or cost...\n');
  
  try {
    // Get calls with 0 duration or 0 cost that have VAPI call IDs
    const { data: calls, error } = await supabase
      .from('calls')
      .select('id, vapi_call_id, duration, cost, organization_id')
      .not('vapi_call_id', 'is', null)
      .or('duration.eq.0,cost.eq.0')
      .limit(100);
    
    if (error) {
      console.error('Error fetching calls:', error);
      return;
    }
    
    console.log(`Found ${calls.length} calls with missing duration or cost\n`);
    
    for (const call of calls) {
      console.log(`\n📞 Processing call ${call.id}`);
      console.log(`   VAPI ID: ${call.vapi_call_id}`);
      console.log(`   Current duration: ${call.duration}, cost: ${call.cost}`);
      
      // Get organization's VAPI credentials
      const { data: org } = await supabase
        .from('organizations')
        .select('vapi_private_key')
        .eq('id', call.organization_id)
        .single();
        
      if (!org || !org.vapi_private_key) {
        console.log('   ❌ No VAPI credentials for organization');
        continue;
      }
      
      try {
        // Fetch call details from VAPI
        const vapiResponse = await axios.get(
          `https://api.vapi.ai/call/${call.vapi_call_id}`,
          {
            headers: {
              'Authorization': `Bearer ${org.vapi_private_key}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        const vapiCall = vapiResponse.data;
        console.log(`   ✅ VAPI data: duration=${vapiCall.duration}, cost=${vapiCall.cost}`);
        
        if (vapiCall.duration || vapiCall.cost) {
          // Update the call record
          const { error: updateError } = await supabase
            .from('calls')
            .update({
              duration: vapiCall.duration || call.duration,
              cost: vapiCall.cost || call.cost,
              updated_at: new Date().toISOString()
            })
            .eq('id', call.id);
            
          if (updateError) {
            console.log(`   ❌ Error updating call:`, updateError);
          } else {
            console.log(`   ✅ Updated call with duration=${vapiCall.duration}, cost=${vapiCall.cost}`);
          }
        }
        
      } catch (vapiError) {
        console.log(`   ❌ Error fetching from VAPI:`, vapiError.message);
      }
    }
    
    console.log('\n✅ Fix complete!');
    
  } catch (err) {
    console.error('Error:', err);
  }
}

// Run the fix
fixCallDurationAndCost();