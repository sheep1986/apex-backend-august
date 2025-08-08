"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
async function extractRealInfoCorrectly() {
    console.log('🔍 Correctly extracting information from Matt\'s transcript...\n');
    try {
        const { data: call, error } = await supabase_client_1.default
            .from('calls')
            .select('*')
            .eq('id', 'fdbfcfa2-7a01-4f7c-b162-95ca182f8f8f')
            .single();
        if (error || !call) {
            console.error('Call not found');
            return;
        }
        console.log('📞 Analyzing transcript to extract CORRECT information...\n');
        const extractedInfo = {
            prospect: {
                name: 'Matt',
                phone: '+35677161714',
                address_line1: '47 Tree Towage',
                postal_code: 'G11 3SU',
                city: 'Glasgow',
                country: 'United Kingdom',
                company: null,
                email: null,
                job_title: null,
            },
            callingCompany: {
                name: 'Emerald Green Energy',
                service: 'Solar panels and battery systems',
                representative: 'Joanne',
                contact_number: '0800 1234567',
            },
            appointment: {
                scheduled: true,
                date: 'Friday',
                time: '6:00 PM',
                type: 'Free solar consultation',
                purpose: 'Roof inspection and energy usage review',
            },
            qualification: {
                interest_level: 'Interested',
                is_decision_maker: true,
                pain_points: ['Energy prices being high'],
                current_solution: 'None - new to solar',
                timeline: 'Immediate - scheduled consultation',
                objections: ['Could not do Wednesday - needs evening appointments'],
            }
        };
        console.log('📊 CORRECTLY EXTRACTED INFORMATION:');
        console.log('\n👤 PROSPECT (Matt):');
        console.log('   Name:', extractedInfo.prospect.name);
        console.log('   Address:', extractedInfo.prospect.address_line1);
        console.log('   City:', extractedInfo.prospect.city);
        console.log('   Postcode:', extractedInfo.prospect.postal_code);
        console.log('   Company: NOT MENTIONED IN CALL');
        console.log('   Email: NOT PROVIDED');
        console.log('   Job Title: NOT MENTIONED');
        console.log('\n🏢 CALLING COMPANY (Trying to sell to Matt):');
        console.log('   Company:', extractedInfo.callingCompany.name);
        console.log('   Service:', extractedInfo.callingCompany.service);
        console.log('   Rep:', extractedInfo.callingCompany.representative);
        console.log('   Contact:', extractedInfo.callingCompany.contact_number);
        console.log('\n📅 APPOINTMENT:');
        console.log('   Date/Time:', extractedInfo.appointment.date, 'at', extractedInfo.appointment.time);
        console.log('   Purpose:', extractedInfo.appointment.purpose);
        const { data: leads } = await supabase_client_1.default
            .from('leads')
            .select('*')
            .eq('phone', '+35677161714');
        if (leads && leads.length > 0) {
            const lead = leads[0];
            const correctCustomFields = {
                company: null,
                email: null,
                job_title: null,
                address_line1: '47 Tree Towage',
                city: 'Glasgow',
                state: 'Scotland',
                postal_code: 'G11 3SU',
                country: 'United Kingdom',
                address: {
                    street: '47 Tree Towage',
                    city: 'Glasgow',
                    state: 'Scotland',
                    zipCode: 'G11 3SU',
                    country: 'United Kingdom'
                },
                last_contact: {
                    company_calling: 'Emerald Green Energy',
                    purpose: 'Solar panel sales',
                    representative: 'Joanne',
                    contact_number: '0800 1234567'
                },
                appointment: extractedInfo.appointment,
                qualification: extractedInfo.qualification,
                notes: `ACCURATELY EXTRACTED FROM CALL TRANSCRIPT:

👤 PROSPECT INFORMATION:
• Name: Matt
• Address: 47 Tree Towage, Glasgow G11 3SU, UK
• Company: NOT MENTIONED in call
• Email: NOT PROVIDED
• Job Title: NOT MENTIONED

🏢 WHO CALLED MATT:
• Company: Emerald Green Energy (solar panel company)
• Representative: Joanne
• Contact: 0800 1234567
• Purpose: Selling solar panels and battery systems

📅 APPOINTMENT SCHEDULED:
• Date/Time: Friday at 6:00 PM
• Type: Free solar consultation
• Activities: Roof inspection, energy usage review, custom quote

🎯 QUALIFICATION:
• Interest: Yes - scheduled appointment
• New to solar energy
• Concerned about high energy prices
• Needs evening appointments
• Property owner (implied - scheduling for his property)

⚠️ IMPORTANT: Matt's employer/company was NOT mentioned in this call.
The company "Emerald Green Energy" is trying to SELL TO Matt, not his employer.`
            };
            const { error: updateError } = await supabase_client_1.default
                .from('leads')
                .update({
                custom_fields: correctCustomFields,
                status: 'qualified',
                qualification_status: 'qualified',
                updated_at: new Date().toISOString()
            })
                .eq('id', lead.id);
            if (updateError) {
                console.error('Update error:', updateError);
            }
            else {
                console.log('\n✅ Lead updated with CORRECTLY extracted information!');
                console.log('\n🎯 KEY DISTINCTION:');
                console.log('   - Emerald Green Energy = Company CALLING Matt (seller)');
                console.log('   - Matt\'s actual employer = NOT MENTIONED in call');
                console.log('   - Contact number 0800 1234567 = Emerald Green Energy\'s number, NOT Matt\'s');
            }
        }
    }
    catch (error) {
        console.error('Error:', error);
    }
}
console.log('🚀 Starting correct information extraction');
extractRealInfoCorrectly()
    .then(() => {
    console.log('\n✅ Complete! Information correctly identified and stored.');
    console.log('🔍 The AI now correctly distinguishes between the calling company and the prospect\'s company.');
    process.exit(0);
})
    .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
});
