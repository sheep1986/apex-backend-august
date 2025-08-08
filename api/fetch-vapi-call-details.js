import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fetchVAPICallDetails() {
  console.log('🔍 Fetching VAPI call details...\n');
  
  const vapiCallId = '8ea2bbfc-8bd3-4764-adf8-c71a11640881';
  const callId = 'd69543b9-01d3-4279-b81d-2cd621a2024c';
  
  try {
    // First get the organization ID
    const { data: call } = await supabase
      .from('calls')
      .select('organization_id, campaign_id')
      .eq('id', callId)
      .single();
      
    if (!call) {
      console.error('Call not found');
      return;
    }
    
    // Get VAPI credentials
    const { data: org } = await supabase
      .from('organizations')
      .select('vapi_private_key, vapi_api_key')
      .eq('id', call.organization_id)
      .single();
      
    if (!org || !org.vapi_private_key) {
      console.error('No VAPI credentials found');
      return;
    }
    
    console.log('📞 Fetching VAPI call:', vapiCallId);
    console.log('🔑 Using API key:', org.vapi_private_key.substring(0, 10) + '...');
    
    try {
      // Try to fetch from VAPI
      const response = await axios.get(
        `https://api.vapi.ai/call/${vapiCallId}`,
        {
          headers: {
            'Authorization': `Bearer ${org.vapi_private_key}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const vapiData = response.data;
      console.log('\n✅ VAPI Response:');
      console.log('Status:', vapiData.status);
      console.log('Started At:', vapiData.startedAt);
      console.log('Ended At:', vapiData.endedAt);
      console.log('Cost:', vapiData.cost);
      console.log('Cost Breakdown:', vapiData.costBreakdown);
      
      // Calculate duration
      if (vapiData.startedAt && vapiData.endedAt) {
        const start = new Date(vapiData.startedAt);
        const end = new Date(vapiData.endedAt);
        const duration = Math.round((end - start) / 1000);
        console.log('Calculated Duration:', duration, 'seconds');
      }
      
      console.log('\nFull VAPI response:', JSON.stringify(vapiData, null, 2));
      
      // Update the database with the correct values
      if (vapiData.cost || (vapiData.startedAt && vapiData.endedAt)) {
        const duration = vapiData.startedAt && vapiData.endedAt ? 
          Math.round((new Date(vapiData.endedAt) - new Date(vapiData.startedAt)) / 1000) : 0;
          
        console.log('\n📝 Updating database...');
        const { error } = await supabase
          .from('calls')
          .update({
            duration: duration,
            cost: vapiData.cost || 0,
            ended_at: vapiData.endedAt,
            updated_at: new Date().toISOString()
          })
          .eq('id', callId);
          
        if (error) {
          console.error('Update error:', error);
        } else {
          console.log('✅ Database updated successfully!');
        }
      }
      
    } catch (apiError) {
      console.error('VAPI API Error:', apiError.response?.data || apiError.message);
      if (apiError.response?.status === 404) {
        console.log('❌ Call not found in VAPI. It may have been deleted or the ID is incorrect.');
      }
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

fetchVAPICallDetails();