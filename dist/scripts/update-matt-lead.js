"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
async function updateMattLead() {
    console.log('🔧 Updating Matt\'s lead with sample data...');
    try {
        const { data: leads, error: fetchError } = await supabase_client_1.default
            .from('leads')
            .select('*')
            .eq('phone', '+35677161714');
        if (fetchError) {
            console.error('Error fetching lead:', fetchError);
            return;
        }
        if (!leads || leads.length === 0) {
            console.log('Lead not found');
            return;
        }
        const lead = leads[0];
        console.log(`📋 Found lead: ${lead.first_name} ${lead.last_name || ''}`);
        console.log(`   ID: ${lead.id}`);
        console.log(`   Phone: ${lead.phone}`);
        const updates = {
            email: 'matt@techsolutions.com',
            company: 'Tech Solutions Ltd',
            status: 'qualified',
            score: 85,
            notes: `🎯 HIGH-INTEREST QUALIFIED LEAD

📧 Contact Information:
• Name: Matt
• Email: matt@techsolutions.com
• Phone: +35677161714
• Company: Tech Solutions Ltd
• Position: Operations Manager
• Location: Malta

💡 Qualification Summary:
• Interest Level: 8/10 - Very interested
• Budget: $10,000 - $25,000 allocated
• Timeline: Q1 2025 implementation
• Decision Authority: Yes - decision maker
• Company Size: 50-200 employees

🎯 Pain Points:
• Currently using manual calling system
• Time-consuming outbound processes
• Need for automation and efficiency
• Looking to scale customer service

✅ Buying Signals:
• Asked about pricing and implementation
• Has budget already allocated
• Wants to move quickly (Q1 2025)
• Decision maker on the call

📞 Call Summary:
Matt expressed strong interest in our AI calling solution. He's currently managing a team using manual processes and sees immediate value in automation. They have budget approved and are looking to implement in Q1 2025.

🚀 Next Steps:
1. Schedule product demo (next week)
2. Send detailed pricing proposal
3. Provide case studies from similar companies
4. Set up follow-up call for decision

💰 Deal Potential: HIGH
Estimated Deal Size: $15,000 - $20,000
Probability of Close: 75%`,
            updated_at: new Date().toISOString()
        };
        const { error: updateError, data: updatedLead } = await supabase_client_1.default
            .from('leads')
            .update(updates)
            .eq('id', lead.id)
            .select();
        if (updateError) {
            console.error('❌ Error updating lead:', updateError);
            console.error('Error details:', JSON.stringify(updateError, null, 2));
        }
        else {
            console.log('✅ Lead updated successfully!');
            console.log('   Email:', updates.email);
            console.log('   Company:', updates.company);
            console.log('   Status:', updates.status);
            console.log('   Score:', updates.score);
            if (updatedLead && updatedLead.length > 0) {
                console.log('\n📊 Updated lead data:');
                console.log('   ID:', updatedLead[0].id);
                console.log('   Name:', updatedLead[0].first_name, updatedLead[0].last_name);
                console.log('   Email:', updatedLead[0].email);
                console.log('   Company:', updatedLead[0].company);
            }
        }
    }
    catch (error) {
        console.error('❌ Script error:', error);
    }
}
console.log('🚀 Starting lead update script');
updateMattLead()
    .then(() => {
    console.log('\n✅ Script complete! Please refresh the CRM page to see the updated information.');
    process.exit(0);
})
    .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
});
