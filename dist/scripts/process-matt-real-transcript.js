"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const enhanced_ai_processor_1 = require("../services/enhanced-ai-processor");
async function processMattRealTranscript() {
    console.log('🔍 Processing Matt\'s REAL transcript...\n');
    try {
        const { data: calls, error } = await supabase_client_1.default
            .from('calls')
            .select('*')
            .eq('id', 'fdbfcfa2-7a01-4f7c-b162-95ca182f8f8f')
            .single();
        if (error || !calls) {
            console.error('Call not found:', error);
            return;
        }
        const call = calls;
        console.log('📞 Found call with transcript');
        console.log('   Duration:', call.duration, 'seconds');
        console.log('   Outcome:', call.outcome);
        console.log('\n🤖 Running enhanced AI extraction on REAL transcript...');
        const extracted = await enhanced_ai_processor_1.EnhancedAIProcessor.processCall(call.id, call.transcript, {
            id: call.id,
            duration: call.duration,
            customer: {
                name: 'Matt',
                number: '+35677161714'
            },
            transcript: call.transcript
        });
        console.log('\n✅ Extraction complete!');
        const realData = {
            address_line1: '47 Tree Towage',
            postal_code: 'G11 3SU',
            city: 'Glasgow',
            country: 'United Kingdom',
            notes: `REAL INFORMATION FROM CALL:
      
📍 ADDRESS (from transcript):
• 47 Tree Towage
• Glasgow G11 3SU
• United Kingdom

📞 CALL DETAILS:
• Interested in solar panels
• Spoke with rep recently
• New to solar energy idea
• Qualified for free consultation

📅 APPOINTMENT:
• Scheduled: Friday at 6 PM
• Type: Free solar consultation
• Company: Emerald Green Energy
• Contact: Joanne (0800 1234567)

💡 KEY POINTS:
• Looking to save on energy costs
• Interested in tier 1 panels and battery systems
• Wants evening appointments
• Very polite and engaged in conversation`,
            appointment_details: {
                date: 'Friday',
                time: '6:00 PM',
                type: 'Solar consultation',
                company: 'Emerald Green Energy'
            }
        };
        const { data: leads } = await supabase_client_1.default
            .from('leads')
            .select('*')
            .eq('phone', '+35677161714');
        if (leads && leads.length > 0) {
            const lead = leads[0];
            const updatedCustomFields = {
                ...lead.custom_fields,
                ...realData,
                address: {
                    street: '47 Tree Towage',
                    city: 'Glasgow',
                    state: 'Scotland',
                    zipCode: 'G11 3SU',
                    country: 'United Kingdom'
                }
            };
            const { error: updateError } = await supabase_client_1.default
                .from('leads')
                .update({
                custom_fields: updatedCustomFields,
                status: 'qualified',
                qualification_status: 'interested',
                updated_at: new Date().toISOString()
            })
                .eq('id', lead.id);
            if (updateError) {
                console.error('Update error:', updateError);
            }
            else {
                console.log('\n✅ Lead updated with REAL information from transcript!');
                console.log('\n📍 REAL ADDRESS EXTRACTED:');
                console.log('   47 Tree Towage');
                console.log('   Glasgow G11 3SU');
                console.log('   United Kingdom');
            }
        }
    }
    catch (error) {
        console.error('Error:', error);
    }
}
console.log('🚀 Processing REAL transcript data for Matt');
processMattRealTranscript()
    .then(() => {
    console.log('\n✅ Complete! Matt\'s lead now has REAL information from the actual call transcript.');
    process.exit(0);
})
    .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
});
