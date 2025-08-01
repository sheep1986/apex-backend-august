const { OpenAILeadAnalysis } = require('./dist/services/openai-lead-analysis');
require('dotenv').config();

async function processSoniaCall() {
  console.log('🔍 Processing Sonia call with OpenAI analysis...\n');
  
  // Set OpenAI API key (you'll need to add this to your .env file)
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in environment variables');
    console.log('Please add your OpenAI API key to the .env file:');
    console.log('OPENAI_API_KEY=your_openai_api_key_here');
    process.exit(1);
  }

  try {
    const analyzer = new OpenAILeadAnalysis();
    
    // Process the call with ID e21ca2b5-9f7d-43ac-baa2-2657811ebfcf (Sonia's call)
    const result = await analyzer.processCall('e21ca2b5-9f7d-43ac-baa2-2657811ebfcf');
    
    if (result) {
      console.log('✅ Call analysis completed!');
      console.log('\n📊 Analysis Results:');
      console.log('Lead Quality:', result.analysis.leadQuality);
      console.log('Confidence Score:', Math.round(result.analysis.confidenceScore * 100) + '%');
      console.log('Qualified:', result.analysis.qualification.qualified);
      console.log('Priority:', result.analysis.qualification.priority);
      console.log('\n👤 Contact Info:');
      console.log('Name:', result.analysis.contactInfo.firstName, result.analysis.contactInfo.lastName);
      console.log('Phone:', result.analysis.contactInfo.phone);
      console.log('Address:', result.analysis.contactInfo.address);
      
      if (result.contact) {
        console.log('\n✅ Contact created in database:');
        console.log('Contact ID:', result.contact.id);
        console.log('Status:', result.contact.status);
      }
      
      console.log('\n🔍 Key Insights:');
      result.analysis.keyInsights.forEach(insight => {
        console.log('  -', insight);
      });
      
    } else {
      console.log('⚠️ No results - call may not have been qualified');
    }
    
  } catch (error) {
    console.error('❌ Error processing call:', error.message);
    
    if (error.message.includes('API key')) {
      console.log('\n💡 Please make sure you have a valid OpenAI API key in your .env file');
    }
  }
}

processSoniaCall().then(() => process.exit(0));