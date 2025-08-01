#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🤖 Setting up AI Call Analysis System\n');

// Step 1: Install OpenAI package
console.log('📦 Installing OpenAI package...');
try {
  execSync('npm install openai', { stdio: 'inherit' });
  console.log('✅ OpenAI package installed\n');
} catch (error) {
  console.error('❌ Failed to install OpenAI package:', error.message);
  process.exit(1);
}

// Step 2: Check for OpenAI API key in environment
console.log('🔑 Checking for OpenAI API key...');
const envPath = path.join(__dirname, '.env');
let envContent = '';

if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
}

if (!envContent.includes('OPENAI_API_KEY')) {
  console.log('⚠️  OpenAI API key not found in .env file');
  console.log('📝 Adding placeholder to .env file...');
  
  const openAIConfig = `
# AI Analysis Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here
AI_PROCESSING_ENABLED=true
AI_MODEL=gpt-4-turbo-preview
`;

  fs.appendFileSync(envPath, openAIConfig);
  console.log('✅ Added OpenAI configuration to .env file');
  console.log('⚠️  Please update OPENAI_API_KEY with your actual key\n');
} else {
  console.log('✅ OpenAI API key found in environment\n');
}

// Step 3: Update server.ts to use enhanced webhook
console.log('📝 Updating server configuration...');
const serverPath = path.join(__dirname, 'server.ts');
let serverContent = fs.readFileSync(serverPath, 'utf8');

// Check if we need to update the import
if (serverContent.includes("import vapiWebhookRouter from './api/vapi-webhook'")) {
  // First, let's create a backup
  fs.writeFileSync(serverPath + '.backup', serverContent);
  console.log('📋 Created backup: server.ts.backup');
  
  // Update the import
  serverContent = serverContent.replace(
    "import vapiWebhookRouter from './api/vapi-webhook'",
    "import vapiWebhookRouter from './api/vapi-webhook-enhanced'"
  );
  
  fs.writeFileSync(serverPath, serverContent);
  console.log('✅ Updated server to use enhanced webhook\n');
} else if (serverContent.includes("import vapiWebhookRouter from './api/vapi-webhook-enhanced'")) {
  console.log('✅ Server already using enhanced webhook\n');
} else {
  console.log('⚠️  Could not find VAPI webhook import in server.ts\n');
}

// Step 4: Create a test script
console.log('📝 Creating test script...');
const testScript = `
const axios = require('axios');

async function testAIAnalysis() {
  console.log('🧪 Testing AI Analysis System\\n');
  
  // Sample webhook payload
  const testPayload = {
    type: 'call-ended',
    call: {
      id: 'test-call-' + Date.now(),
      duration: 180,
      cost: 0.15,
      transcript: [
        { speaker: 'user', text: 'Hello, I heard about your solar panels' },
        { speaker: 'ai', text: 'Hi! Thanks for your interest. May I have your name?' },
        { speaker: 'user', text: 'Sure, I\\'m John Smith from ABC Company' },
        { speaker: 'ai', text: 'Nice to meet you John. What specifically interests you about solar?' },
        { speaker: 'user', text: 'We\\'re looking to reduce our energy costs. Our monthly bill is around $5000' },
        { speaker: 'ai', text: 'That\\'s a significant amount. Would you like to schedule a consultation?' },
        { speaker: 'user', text: 'Yes, how about next Friday at 2pm?' },
        { speaker: 'ai', text: 'Perfect! I\\'ll schedule that for you. What\\'s the best number to reach you?' },
        { speaker: 'user', text: 'You can call me at 555-123-4567' }
      ]
    }
  };
  
  try {
    console.log('📤 Sending test webhook...');
    const response = await axios.post('http://localhost:3001/api/vapi/webhook', testPayload);
    console.log('✅ Webhook accepted:', response.data);
    
    // Wait a moment for processing
    console.log('\\n⏳ Waiting for AI processing...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check the queue
    console.log('\\n📊 Checking processing queue...');
    const queueResponse = await axios.get('http://localhost:3001/api/vapi/process-queue');
    console.log('Queue status:', queueResponse.data);
    
    console.log('\\n✅ Test completed! Check your database for results.');
    console.log('\\nSQL to check results:');
    console.log('SELECT id, interest_level, ai_analysis FROM calls WHERE id LIKE \\'test-call-%\\' ORDER BY created_at DESC LIMIT 1;');
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testAIAnalysis();
`;

fs.writeFileSync(path.join(__dirname, 'test-ai-analysis.js'), testScript);
console.log('✅ Created test-ai-analysis.js\n');

// Step 5: Show next steps
console.log('📋 Setup Complete! Next steps:\n');
console.log('1. Update your .env file with your OpenAI API key:');
console.log('   OPENAI_API_KEY=sk-your-actual-key-here\n');
console.log('2. Run the database migration:');
console.log('   psql $DATABASE_URL < database/ai-analysis-schema.sql\n');
console.log('3. Start the server:');
console.log('   npm run dev\n');
console.log('4. Test the AI analysis:');
console.log('   node test-ai-analysis.js\n');
console.log('5. Set up queue processing (add to cron):');
console.log('   * * * * * curl http://localhost:3001/api/vapi/process-queue\n');

console.log('🎉 AI Call Analysis system is ready to use!');