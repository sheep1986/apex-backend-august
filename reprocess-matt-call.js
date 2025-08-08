const axios = require('axios');

async function reprocessMattCall() {
  const mattCallId = 'fdbfcfa2-7a01-4f7c-b162-95ca182f8f8f';
  
  console.log('Sending request to reprocess Matt\'s call...\n');
  
  try {
    // Call the backend API to trigger reprocessing
    const response = await axios.post(
      'http://localhost:3001/api/calls/reprocess',
      {
        callId: mattCallId
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Response:', response.data);
    
    // Wait a bit for processing to complete
    console.log('\nWaiting 5 seconds for processing to complete...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check the results
    const { createClient } = require('@supabase/supabase-js');
    require('dotenv').config();
    
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Check updated call record
    const { data: call } = await supabase
      .from('calls')
      .select('*')
      .eq('id', mattCallId)
      .single();
      
    console.log('\n=== UPDATED CALL RECORD ===');
    console.log('Address:', call.address || 'NOT SAVED');
    console.log('Email:', call.customer_email || 'NOT SAVED');
    console.log('Summary:', call.summary ? 'YES' : 'NO');
    console.log('AI Confidence Score:', call.ai_confidence_score);
    console.log('Appointment Details:', call.appointment_details || 'NOT SAVED');
    
    // Check if lead was created
    const { data: leads } = await supabase
      .from('leads')
      .select('*')
      .eq('phone', '+35677161714');
      
    console.log('\n=== LEADS IN CRM ===');
    if (leads && leads.length > 0) {
      leads.forEach(lead => {
        console.log('Lead ID:', lead.id);
        console.log('Name:', lead.first_name, lead.last_name);
        console.log('Address:', lead.address || 'NOT SAVED');
        console.log('Email:', lead.email || 'NOT SAVED');
      });
    } else {
      console.log('No leads found');
    }
    
  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.status, error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

reprocessMattCall();