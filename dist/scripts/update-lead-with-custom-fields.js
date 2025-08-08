"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
async function updateLeadWithCustomFields() {
    console.log('🔧 Updating lead with address in custom_fields...');
    try {
        const { data: leads, error: fetchError } = await supabase_client_1.default
            .from('leads')
            .select('*')
            .eq('phone', '+35677161714');
        if (fetchError || !leads || leads.length === 0) {
            console.error('Lead not found');
            return;
        }
        const lead = leads[0];
        console.log(`📋 Found lead: ${lead.first_name}`);
        console.log(`   Current custom_fields:`, lead.custom_fields);
        const customFields = {
            ...lead.custom_fields,
            email: 'matt@techsolutions.com',
            company: 'Tech Solutions Ltd',
            job_title: 'Operations Manager',
            address: {
                street: '123 Business Park',
                city: 'Valletta',
                state: 'Malta',
                zipCode: 'VLT 1234',
                country: 'Malta'
            },
            address_line1: '123 Business Park',
            city: 'Valletta',
            state: 'Malta',
            postal_code: 'VLT 1234',
            country: 'Malta',
            notes: 'High-interest lead. Interested in AI calling solution for customer service. Budget: $10,000-$25,000. Timeline: Q1 2025.',
            industry: 'Technology',
            company_size: '50-200 employees',
            budget: '$10,000 - $25,000',
            timeline: 'Q1 2025',
            qualification_details: {
                interestLevel: 8,
                painPoints: ['Manual processes', 'Time consuming', 'Need automation'],
                currentSolution: 'Manual calling system',
                decisionAuthority: 'Yes - Decision Maker'
            }
        };
        const { error: updateError } = await supabase_client_1.default
            .from('leads')
            .update({
            custom_fields: customFields,
            status: 'qualified',
            score: 85,
            qualification_status: 'qualified',
            updated_at: new Date().toISOString()
        })
            .eq('id', lead.id);
        if (updateError) {
            console.error('❌ Update error:', updateError);
        }
        else {
            console.log('✅ Lead updated successfully!');
            console.log('\n📍 Address Information Added:');
            console.log('   Street:', customFields.address_line1);
            console.log('   City:', customFields.city);
            console.log('   State:', customFields.state);
            console.log('   Postal Code:', customFields.postal_code);
            console.log('   Country:', customFields.country);
            console.log('\n📧 Contact Information:');
            console.log('   Email:', customFields.email);
            console.log('   Company:', customFields.company);
            console.log('   Position:', customFields.job_title);
            console.log('\n💡 Additional Details:');
            console.log('   Budget:', customFields.budget);
            console.log('   Timeline:', customFields.timeline);
            console.log('   Industry:', customFields.industry);
        }
    }
    catch (error) {
        console.error('❌ Script error:', error);
    }
}
console.log('🚀 Starting custom fields update');
updateLeadWithCustomFields()
    .then(() => {
    console.log('\n✅ Complete! The address data is now stored in custom_fields.');
    console.log('⚠️  Note: The frontend may need to be updated to read from custom_fields for address data.');
    process.exit(0);
})
    .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
});
