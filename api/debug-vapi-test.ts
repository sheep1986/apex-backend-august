import { Router } from 'express';
import axios from 'axios';

const router = Router();

// Direct VAPI test endpoint
router.get('/direct-test', async (req, res) => {
  console.log('\n🔍 DEBUG: Direct VAPI test endpoint called');
  
  try {
    // Test with hardcoded API key first
    const VAPI_API_KEY = 'da8956d4-0508-474e-bd96-7eda82d2d943';
    
    console.log('🔑 Using API key:', VAPI_API_KEY.substring(0, 10) + '...');
    
    // Create simple axios instance
    const client = axios.create({
      baseURL: 'https://api.vapi.ai',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    // Test assistants endpoint
    console.log('📡 Calling VAPI /assistant endpoint...');
    const assistantsResponse = await client.get('/assistant');
    console.log('✅ Assistants response:', {
      status: assistantsResponse.status,
      count: assistantsResponse.data?.length
    });
    
    // Test phone numbers endpoint
    console.log('📡 Calling VAPI /phone-number endpoint...');
    const phoneResponse = await client.get('/phone-number');
    console.log('✅ Phone numbers response:', {
      status: phoneResponse.status,
      count: phoneResponse.data?.length
    });
    
    res.json({
      success: true,
      assistants: assistantsResponse.data,
      phoneNumbers: phoneResponse.data
    });
    
  } catch (error: any) {
    console.error('❌ Direct test failed:', error.message);
    if (error.response) {
      console.error('Response error:', {
        status: error.response.status,
        data: error.response.data
      });
    } else if (error.request) {
      console.error('Request error:', {
        code: error.code,
        syscall: error.syscall,
        hostname: error.hostname
      });
    }
    
    res.status(500).json({
      error: 'Failed to test VAPI',
      message: error.message,
      details: error.response?.data || error.code
    });
  }
});

export default router;