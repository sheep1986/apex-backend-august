import axios from 'axios';

// Simulate a VAPI webhook call
async function testVAPIWebhook() {
  console.log('🧪 Testing VAPI webhook endpoint...\n');
  
  const webhookUrl = 'http://localhost:3001/api/vapi-automation-webhook';
  
  // Sample VAPI webhook payload
  const payload = {
    message: {
      type: 'end-of-call-report',
      call: {
        id: 'test-call-123',
        status: 'ended',
        endedReason: 'customer-ended-call',
        startedAt: '2025-08-06T09:00:00Z',
        endedAt: '2025-08-06T09:05:30Z',
        cost: 0.125,
        costBreakdown: {
          transport: 0.05,
          stt: 0.025,
          llm: 0.025,
          tts: 0.025,
          vapi: 0,
          total: 0.125
        },
        customer: {
          number: '+1234567890',
          name: 'Test Customer'
        },
        messages: [
          {
            role: 'user',
            message: 'Hello',
            time: 1000,
            secondsFromStart: 1
          },
          {
            role: 'assistant', 
            message: 'Hi there, how can I help you?',
            time: 2500,
            secondsFromStart: 2.5
          }
        ],
        recordingUrl: 'https://example.com/recording.mp3'
      }
    }
  };
  
  try {
    console.log('📤 Sending webhook payload...');
    const response = await axios.post(webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Webhook response:', response.status, response.data);
  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testVAPIWebhook();