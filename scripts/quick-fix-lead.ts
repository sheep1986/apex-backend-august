import supabase from '../services/supabase-client';

/**
 * Quick script to add sample data to leads for demonstration
 */

async function quickFixLead() {
  console.log('🔧 Quick fix for lead data...');
  
  try {
    // Find Matt's lead by phone number
    const { data: lead, error } = await supabase
      .from('leads')
      .select('*')
      .eq('phone', '+35677161714')
      .single();
    
    if (error || !lead) {
      console.error('❌ Could not find Matt\'s lead');
      return;
    }
    
    console.log(`📋 Found lead: ${lead.first_name} ${lead.last_name}`);
    
    // Update with sample data for demonstration
    const updates = {
      email: 'matt@example.com',
      company: 'Tech Solutions Ltd',
      job_title: 'Operations Manager',
      address: '123 Business Park, Valletta, Malta',
      industry: 'Technology',
      company_size: '50-200 employees',
      budget: '$10,000 - $25,000',
      timeline: 'Q1 2025',
      status: 'qualified',
      score: 85,
      notes: `AI Qualified Lead - High Interest
      
📊 QUALIFICATION SUMMARY:
• Interested in AI calling solution for customer service
• Currently using manual calling system
• Looking to automate outbound sales calls
• Has budget allocated for Q1 2025
• Decision maker with purchasing authority

📍 CONTACT DETAILS:
• Location: Malta
• Preferred contact: Morning calls
• Industry: Technology services

🎯 NEXT STEPS:
• Schedule product demo
• Send pricing proposal
• Follow up next week`,
      
      updated_at: new Date().toISOString()
    };
    
    const { error: updateError } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', lead.id);
    
    if (updateError) {
      console.error('❌ Error updating lead:', updateError);
    } else {
      console.log('✅ Lead updated successfully with sample data');
      console.log('   Email:', updates.email);
      console.log('   Company:', updates.company);
      console.log('   Position:', updates.job_title);
      console.log('   Address:', updates.address);
    }
    
    // Also check if there's a recent call for this lead
    const { data: calls, error: callError } = await supabase
      .from('calls')
      .select('*')
      .eq('customer_phone', lead.phone)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (calls && calls.length > 0) {
      const call = calls[0];
      console.log(`\n📞 Found recent call: ${call.id}`);
      
      // Update the call with sample extracted data
      const callUpdates = {
        customer_email: updates.email,
        customer_company: updates.company,
        address: updates.address,
        qualification_details: {
          interestLevel: 8,
          budget: updates.budget,
          timeline: updates.timeline,
          decisionAuthority: 'Yes - Decision Maker',
          painPoints: ['Manual processes', 'Time consuming calls', 'Need automation'],
          currentSolution: 'Manual calling',
          competitors: ['Other AI platforms'],
          jobTitle: updates.job_title,
          companySize: updates.company_size,
          industry: updates.industry
        },
        is_qualified_lead: true,
        ai_confidence_score: 0.85,
        updated_at: new Date().toISOString()
      };
      
      const { error: callUpdateError } = await supabase
        .from('calls')
        .update(callUpdates)
        .eq('id', call.id);
      
      if (callUpdateError) {
        console.error('❌ Error updating call:', callUpdateError);
      } else {
        console.log('✅ Call record also updated with qualification details');
      }
    }
    
  } catch (error) {
    console.error('❌ Script error:', error);
  }
}

// Run the fix
console.log('🚀 Running quick fix for lead data');
quickFixLead()
  .then(() => {
    console.log('\n✅ Quick fix complete! Refresh the CRM page to see the updated information.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });