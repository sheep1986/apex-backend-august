import { EnhancedAIProcessor } from '../services/enhanced-ai-processor';

// Test scenarios to demonstrate how AI determines interest
const testScenarios = [
  {
    name: "High Interest - Appointment Scheduled",
    transcript: `
      Rep: Hi, this is Sarah from TechSolutions. We help companies reduce IT costs.
      Prospect: Oh, that sounds interesting. We've been struggling with our IT expenses.
      Rep: Great! I'd love to show you how we can save you 30% on your current costs.
      Prospect: That would be amazing. Can we schedule a meeting for next Tuesday at 2 PM?
      Rep: Perfect! I'll send you a calendar invite.
      Prospect: Great, my email is john@company.com
    `,
    expectedInterest: 8,
    expectedQualified: true
  },
  {
    name: "Medium Interest - Asking Questions",
    transcript: `
      Rep: Hi, calling from CloudServices about our new backup solution.
      Prospect: Hmm, how much does something like that typically cost?
      Rep: It depends on your data volume, but usually starts at $500/month.
      Prospect: That's a bit high for us right now. Maybe in a few months?
      Rep: No problem, I'll follow up with you in Q2.
      Prospect: Sure, that works.
    `,
    expectedInterest: 5,
    expectedQualified: false  // Below threshold
  },
  {
    name: "Low Interest - Polite Decline",
    transcript: `
      Rep: Hi, this is Mike from Marketing Pro. We help boost online sales.
      Prospect: Thanks for calling, but we're happy with our current provider.
      Rep: I understand. May I ask who you're currently using?
      Prospect: We use an in-house team. Not looking to change.
      Rep: Got it. Thanks for your time.
    `,
    expectedInterest: 3,
    expectedQualified: false
  },
  {
    name: "No Interest - Explicit Rejection",
    transcript: `
      Rep: Hi, calling from SalesBoost about our lead generation service.
      Prospect: Not interested. Please remove me from your list.
      Rep: I'll make sure you're removed right away.
      Prospect: Thank you. Goodbye.
    `,
    expectedInterest: 1,
    expectedQualified: false
  },
  {
    name: "High Interest - Matt's Solar Example",
    transcript: `
      Rep: Hi Matt, this is Joanne from Emerald Green Energy about solar panels.
      Matt: Oh yes, I remember speaking with someone recently.
      Rep: Great! We can offer you tier 1 panels with battery systems to help with those high energy prices.
      Matt: That sounds good. I'm interested in learning more.
      Rep: Wonderful! Can we schedule a free consultation? How about Friday at 6 PM?
      Matt: Friday at 6 works perfectly for me.
      Rep: Excellent! I'll have our consultant visit you at 47 Tree Towage, G11 3SU.
      Matt: That's correct. See you then!
    `,
    expectedInterest: 8,
    expectedQualified: true
  }
];

async function testInterestDetection() {
  console.log('🧪 Testing AI Interest Detection Logic\n');
  console.log('=' .repeat(80));
  console.log('\nHOW THE AI DETERMINES IF A LEAD SHOULD BE CREATED:\n');
  console.log('✅ QUALIFIED (Lead Created) when:');
  console.log('   • Interest level >= 6/10');
  console.log('   • Scheduled an appointment');
  console.log('   • Asked for pricing/proposal');
  console.log('   • Provided contact info willingly');
  console.log('   • Asked to be contacted again\n');
  
  console.log('❌ NOT QUALIFIED (No Lead) when:');
  console.log('   • Interest level <= 3/10');
  console.log('   • Said "not interested" explicitly');
  console.log('   • Asked to be removed from list');
  console.log('   • Hung up immediately\n');
  console.log('=' .repeat(80));
  
  for (const scenario of testScenarios) {
    console.log(`\n\n📞 SCENARIO: ${scenario.name}`);
    console.log('-' .repeat(60));
    console.log('TRANSCRIPT PREVIEW:');
    console.log(scenario.transcript.trim().split('\n').slice(0, 3).join('\n') + '...\n');
    
    // Use the basic extraction for testing (no GPT-4 needed)
    const extracted = (EnhancedAIProcessor as any).basicExtraction(scenario.transcript, null);
    
    console.log('🤖 AI ANALYSIS:');
    console.log(`   Interest Level: ${extracted.interestLevel || 'Unknown'}/10`);
    console.log(`   Qualified Lead: ${extracted.isQualifiedLead ? '✅ YES' : '❌ NO'}`);
    console.log(`   Expected: Interest ${scenario.expectedInterest}/10, Qualified: ${scenario.expectedQualified ? 'YES' : 'NO'}`);
    
    if (extracted.isQualifiedLead) {
      console.log(`   → Lead would be CREATED in CRM`);
      console.log(`   → Status: "qualified"`);
      console.log(`   → Score: ${Math.round((extracted.confidenceScore || 0.5) * 100)}`);
    } else {
      console.log(`   → NO lead created (below threshold or explicit disinterest)`);
    }
    
    // Check if matches expectation
    const matchesExpectation = extracted.isQualifiedLead === scenario.expectedQualified;
    console.log(`   Result: ${matchesExpectation ? '✅ Correct' : '⚠️ May need tuning'}`);
  }
  
  console.log('\n' + '=' .repeat(80));
  console.log('\n📊 SUMMARY:');
  console.log('The AI now uses a threshold of 6/10 interest level to create leads.');
  console.log('This prevents creating leads for every call, focusing only on genuine prospects.');
  console.log('Special keywords (appointment, pricing, etc.) can override the threshold.\n');
}

console.log('🚀 Starting Interest Detection Test\n');
testInterestDetection()
  .then(() => {
    console.log('✅ Test complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });