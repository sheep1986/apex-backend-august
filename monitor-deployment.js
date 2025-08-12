#!/usr/bin/env node

const https = require('https');

console.log('🔄 Monitoring Railway deployment...');
console.log('Waiting for fast_ack feature to appear...\n');

let attempts = 0;
const maxAttempts = 60; // 10 minutes max

const checkDeployment = () => {
  attempts++;
  
  https.get('https://apex-backend-august-production.up.railway.app/api/vapi/status', (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const status = JSON.parse(data);
        const hasFastAck = status.features && status.features.fast_ack === true;
        
        console.log(`[${new Date().toLocaleTimeString()}] Attempt ${attempts}/${maxAttempts}`);
        console.log(`  Status: ${hasFastAck ? '✅ DEPLOYED!' : '⏳ Still old version'}`);
        
        if (hasFastAck) {
          console.log('\n🎉 SUCCESS! Fast ACK webhook is now deployed!');
          console.log('Features:', JSON.stringify(status.features, null, 2));
          
          // Test the webhook response time
          testWebhook();
        } else if (attempts < maxAttempts) {
          console.log(`  Features: ${Object.keys(status.features || {}).join(', ')}`);
          console.log('  Checking again in 10 seconds...\n');
          setTimeout(checkDeployment, 10000);
        } else {
          console.log('\n❌ Deployment timeout! Railway may be stuck.');
          console.log('Manual intervention required - check Railway dashboard.');
          process.exit(1);
        }
      } catch (error) {
        console.error('Error parsing response:', error);
        if (attempts < maxAttempts) {
          setTimeout(checkDeployment, 10000);
        }
      }
    });
  }).on('error', (err) => {
    console.error('Request error:', err);
    if (attempts < maxAttempts) {
      setTimeout(checkDeployment, 10000);
    }
  });
};

const testWebhook = () => {
  console.log('\n📞 Testing webhook response time...');
  
  const startTime = Date.now();
  const postData = JSON.stringify({
    type: 'test',
    call: { id: 'test-deployment-check' }
  });
  
  const options = {
    hostname: 'apex-backend-august-production.up.railway.app',
    path: '/api/vapi/webhook',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': postData.length
    }
  };
  
  const req = https.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      const responseTime = Date.now() - startTime;
      console.log(`  Response time: ${responseTime}ms`);
      console.log(`  Response: ${data}`);
      
      if (responseTime < 1000) {
        console.log('  ✅ Webhook is responding quickly!');
      } else {
        console.log('  ⚠️ Webhook is slow - may need investigation');
      }
      
      console.log('\n✨ Deployment complete! VAPI webhooks should now work.');
    });
  });
  
  req.on('error', (error) => {
    console.error('Webhook test error:', error);
  });
  
  req.write(postData);
  req.end();
};

// Start monitoring
checkDeployment();