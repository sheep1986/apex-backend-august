#!/usr/bin/env node

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://twigokrtbvigiqnaybfy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

async function testVapiCall() {
  console.log('🔍 Testing VAPI call creation...\n');
  
  try {
    // Get organization VAPI credentials
    const orgId = '2566d8c5-2245-4a3c-b539-4cea21a07d9b';
    const { data: org } = await supabase
      .from('organizations')
      .select('vapi_api_key, vapi_private_key')
      .eq('id', orgId)
      .single();
    
    console.log('Organization has VAPI keys:');
    console.log('  API Key (public):', org?.vapi_api_key ? '✅' : '❌');
    console.log('  Private Key:', org?.vapi_private_key ? '✅' : '❌');
    
    // Use the private key for API calls
    const apiKey = org?.vapi_private_key || process.env.VAPI_API_KEY;
    
    if (!apiKey) {
      console.error('❌ No VAPI API key found!');
      return;
    }
    
    console.log('\n📞 Making test call to VAPI...');
    console.log('Using API key:', apiKey.substring(0, 10) + '...');
    
    // Test VAPI API directly
    const testCall = {
      assistantId: 'b6c626b2-d159-42f3-a8cd-cad8d0f7536c',
      phoneNumberId: 'd49a7d01-7caa-4421-b634-e8057494913d',
      customer: {
        number: '+447526126716',
        name: 'Test Call'
      }
    };
    
    console.log('\nCall payload:', JSON.stringify(testCall, null, 2));
    
    try {
      const response = await axios.post(
        'https://api.vapi.ai/call',
        testCall,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      console.log('\n✅ VAPI call created successfully!');
      console.log('Call ID:', response.data.id);
      console.log('Status:', response.data.status);
      console.log('Full response:', JSON.stringify(response.data, null, 2));
      
    } catch (vapiError) {
      console.error('\n❌ VAPI API Error:');
      console.error('Status:', vapiError.response?.status);
      console.error('Error:', vapiError.response?.data || vapiError.message);
      
      if (vapiError.response?.status === 401) {
        console.log('\n🔧 Fix: The API key is invalid or expired');
        console.log('1. Check your VAPI dashboard for the correct API key');
        console.log('2. Update it in Organization Settings or backend .env');
      } else if (vapiError.response?.status === 400) {
        console.log('\n🔧 Fix: The request is invalid');
        console.log('Check if the assistant ID and phone number ID are correct');
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testVapiCall();