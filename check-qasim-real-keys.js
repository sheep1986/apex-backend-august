require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkQasimRealKeys() {
  try {
    console.log('🔍 Checking if Qasim\'s VAPI Keys are Real or Copied');
    console.log('==================================================\n');

    const emeraldGreenOrgId = '2566d8c5-2245-4a3c-b539-4cea21a07d9b';

    // Get current keys for Emerald Green Energy
    const { data: emeraldGreen, error: emeraldError } = await supabase
      .from('organizations')
      .select('name, vapi_api_key, vapi_private_key, settings')
      .eq('id', emeraldGreenOrgId)
      .single();

    if (emeraldError || !emeraldGreen) {
      console.error('❌ Error fetching Emerald Green Energy:', emeraldError);
      return;
    }

    console.log('🏢 Organization:', emeraldGreen.name);
    console.log('🔑 Current API Key in Database:', emeraldGreen.vapi_api_key);

    // Test if this key actually belongs to Emerald Green Energy or was copied from Test Corp
    console.log('\n🧪 Testing API Key to see what assistants it returns...');
    
    const https = require('https');
    
    const testVAPI = (apiKey) => {
      return new Promise((resolve, reject) => {
        const options = {
          hostname: 'api.vapi.ai',
          port: 443,
          path: '/assistant',
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        };
        
        const req = https.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const result = JSON.parse(data);
                resolve(result);
              } catch (e) {
                reject(new Error('Failed to parse response'));
              }
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          });
        });
        
        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timeout'));
        });
        
        req.end();
      });
    };

    try {
      const assistants = await testVAPI(emeraldGreen.vapi_api_key);
      
      console.log(`✅ API Key works - Found ${assistants.length} assistants:`);
      
      // Check if the assistants suggest this is Qasim's real account or copied from elsewhere
      const assistantNames = assistants.map(a => a.name).filter(name => name);
      
      console.log('\n📋 Assistant Names Found:');
      assistantNames.forEach((name, index) => {
        console.log(`   ${index + 1}. ${name}`);
      });

      // Analyse assistant names to determine if they belong to Emerald Green Energy
      const emeraldGreenRelated = assistantNames.filter(name => 
        name.toLowerCase().includes('emerald') || 
        name.toLowerCase().includes('green') || 
        name.toLowerCase().includes('energy')
      );

      const testCorpRelated = assistantNames.filter(name => 
        name.toLowerCase().includes('test') || 
        name.toLowerCase().includes('corp')
      );

      const genericNames = assistantNames.filter(name => 
        name.toLowerCase().includes('sofia') || 
        name.toLowerCase().includes('marcus') || 
        name.toLowerCase().includes('insurance') ||
        name.toLowerCase().includes('artificial media')
      );

      console.log('\n🎯 Analysis:');
      
      if (emeraldGreenRelated.length > 0) {
        console.log(`✅ Found ${emeraldGreenRelated.length} Emerald Green Energy related assistants:`);
        emeraldGreenRelated.forEach(name => console.log(`   - ${name}`));
        console.log('💡 This suggests the API key might be legitimate for Emerald Green Energy');
      }

      if (testCorpRelated.length > 0) {
        console.log(`⚠️ Found ${testCorpRelated.length} Test Corp related assistants:`);
        testCorpRelated.forEach(name => console.log(`   - ${name}`));
        console.log('💡 This suggests the API key was copied from Test Corp');
      }

      if (genericNames.length > 0 && emeraldGreenRelated.length === 0) {
        console.log(`⚠️ Found ${genericNames.length} generic/demo assistants:`);
        genericNames.forEach(name => console.log(`   - ${name}`));
        console.log('💡 This suggests the API key is from a demo/test account');
      }

      console.log('\n🤔 CONCLUSION:');
      if (emeraldGreenRelated.length > 0) {
        console.log('✅ The API key appears to legitimately belong to Emerald Green Energy');
      } else {
        console.log('❌ The API key appears to be copied from another account (Test Corp or demo)');
        console.log('💡 RECOMMENDATION: Qasim should add his real VAPI API keys');
        console.log('   1. Login to his VAPI.ai account');
        console.log('   2. Get his real API keys');
        console.log('   3. Update them in Organization Settings');
      }

    } catch (error) {
      console.error('❌ Error testing API key:', error.message);
    }

  } catch (error) {
    console.error('❌ Error checking keys:', error);
  }
}

// Run the check
checkQasimRealKeys();