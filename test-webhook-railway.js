#!/usr/bin/env node

/**
 * Test script to verify VAPI webhook is working on Railway deployment
 * This will help us confirm that the enhanced webhook handler is properly deployed
 */

const https = require('https');

// Railway production URL
const RAILWAY_URL = 'apex-backend-august-production.up.railway.app';

console.log('🚀 Testing VAPI Webhook on Railway Deployment\n');
console.log('=' .repeat(60));

// Test 1: Check health endpoint
function testHealthEndpoint() {
  return new Promise((resolve) => {
    console.log('\n📍 Test 1: Checking webhook health endpoint...');
    
    const options = {
      hostname: RAILWAY_URL,
      path: '/api/vapi-enhanced/status',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ Health endpoint responding');
          try {
            const json = JSON.parse(data);
            console.log('   Version:', json.version);
            console.log('   Features:', json.features?.join(', '));
          } catch (e) {
            console.log('   Response:', data);
          }
        } else {
          console.log(`❌ Health endpoint returned status ${res.statusCode}`);
          console.log('   Response:', data);
        }
        resolve();
      });
    });

    req.on('error', (error) => {
      console.log('❌ Failed to reach health endpoint:', error.message);
      resolve();
    });

    req.end();
  });
}

// Test 2: Send a test webhook payload
function testWebhookPayload() {
  return new Promise((resolve) => {
    console.log('\n📍 Test 2: Sending test webhook payload...');
    
    const testPayload = {
      type: 'call-ended',
      call: {
        id: 'test-' + Date.now(),
        assistantId: 'test-assistant',
        phoneNumber: '+1234567890',
        startedAt: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
        endedAt: new Date().toISOString(),
        duration: 300,
        cost: 0.50,
        transcript: 'Test transcript: This is a test call to verify webhook processing.',
        recordingUrl: 'https://example.com/test-recording.mp3'
      },
      timestamp: new Date().toISOString()
    };

    const postData = JSON.stringify(testPayload);
    
    const options = {
      hostname: RAILWAY_URL,
      path: '/api/vapi-enhanced/webhook',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ Webhook accepted (200 OK)');
          try {
            const json = JSON.parse(data);
            console.log('   Response:', JSON.stringify(json, null, 2));
            if (json.processingAsync === true) {
              console.log('   ✓ Async processing confirmed');
            }
          } catch (e) {
            console.log('   Response:', data);
          }
        } else {
          console.log(`❌ Webhook returned status ${res.statusCode}`);
          console.log('   Response:', data);
        }
        resolve();
      });
    });

    req.on('error', (error) => {
      console.log('❌ Failed to send webhook:', error.message);
      resolve();
    });

    req.write(postData);
    req.end();
  });
}

// Test 3: Check backend API health
function testBackendHealth() {
  return new Promise((resolve) => {
    console.log('\n📍 Test 3: Checking main backend health...');
    
    const options = {
      hostname: RAILWAY_URL,
      path: '/api/health',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ Backend API is healthy');
          try {
            const json = JSON.parse(data);
            console.log('   Status:', json.status);
            if (json.redis) {
              console.log('   Redis:', json.redis);
            }
            if (json.database) {
              console.log('   Database:', json.database);
            }
          } catch (e) {
            console.log('   Response:', data);
          }
        } else {
          console.log(`❌ Backend health check returned status ${res.statusCode}`);
          console.log('   Response:', data);
        }
        resolve();
      });
    });

    req.on('error', (error) => {
      console.log('❌ Failed to reach backend:', error.message);
      resolve();
    });

    req.end();
  });
}

// Test 4: Check if old webhook endpoint exists
function testOldWebhookEndpoint() {
  return new Promise((resolve) => {
    console.log('\n📍 Test 4: Checking if old webhook endpoint exists...');
    
    const options = {
      hostname: RAILWAY_URL,
      path: '/api/vapi-automation-webhook',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 404) {
          console.log('✅ Old endpoint not found (expected)');
        } else if (res.statusCode === 200) {
          console.log('⚠️  Old webhook endpoint still exists');
          console.log('   Consider updating VAPI to use /api/vapi-webhook-v2');
        } else {
          console.log(`   Status: ${res.statusCode}`);
        }
        resolve();
      });
    });

    req.on('error', (error) => {
      console.log('❌ Error checking old endpoint:', error.message);
      resolve();
    });

    req.end();
  });
}

// Run all tests
async function runTests() {
  console.log('🔗 Testing Railway deployment at:');
  console.log(`   https://${RAILWAY_URL}`);
  
  await testHealthEndpoint();
  await testWebhookPayload();
  await testBackendHealth();
  await testOldWebhookEndpoint();
  
  console.log('\n' + '='.repeat(60));
  console.log('📋 Test Summary:\n');
  console.log('Next Steps:');
  console.log('1. If webhook health is working, update VAPI dashboard with:');
  console.log(`   Webhook URL: https://${RAILWAY_URL}/api/vapi-enhanced/webhook`);
  console.log('2. If Redis is not connected, check Railway Redis configuration');
  console.log('3. Run a real test call through VAPI to verify end-to-end flow');
  console.log('\n✨ Testing complete!');
}

// Execute tests
runTests().catch(console.error);