"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
async function fixMattNotes() {
    console.log('🔍 Checking Matt\'s lead notes for duplicates...\n');
    try {
        const { data: leads, error } = await supabase_client_1.default
            .from('leads')
            .select('*')
            .eq('phone', '+35677161714');
        if (error || !leads || leads.length === 0) {
            console.error('Lead not found');
            return;
        }
        const lead = leads[0];
        console.log('📋 Found lead:', lead.first_name);
        console.log('   Lead ID:', lead.id);
        if (lead.custom_fields?.notes) {
            const currentNotes = lead.custom_fields.notes;
            console.log('\n📝 Current notes length:', currentNotes.length, 'characters');
            console.log('\n📄 First 500 characters of notes:');
            console.log(currentNotes.substring(0, 500));
            console.log('...\n');
            const lines = currentNotes.split('\n');
            console.log('Total lines:', lines.length);
            const cleanSummary = `📞 CALL SUMMARY - Matt (Solar Panel Inquiry)

🏢 COMPANY CALLING: Emerald Green Energy
📱 CONTACT: +35677161714
📍 ADDRESS: 47 Tree Towage, Glasgow G11 3SU, UK

✅ OUTCOME: Interested - Appointment Scheduled
📅 APPOINTMENT: Friday at 6:00 PM
🎯 PURPOSE: Free solar consultation with roof inspection

💡 KEY POINTS:
• Matt remembered speaking with rep recently
• Interested in tier 1 solar panels with battery systems
• Concerned about high energy prices
• Needs evening appointments (couldn't do Wednesday)
• Agreed to Friday 6 PM consultation

🔍 QUALIFICATION:
• Interest Level: 8/10 (High)
• Decision Maker: Yes (scheduling for his property)
• Timeline: Immediate (consultation scheduled)
• Pain Point: High energy costs

📌 IMPORTANT NOTE: 
• Emerald Green Energy (0800 1234567) is the company selling TO Matt
• Matt's employer was NOT mentioned in the call`;
            const updatedCustomFields = {
                ...lead.custom_fields,
                notes: cleanSummary
            };
            console.log('🧹 Cleaning up duplicate notes...');
            console.log('📝 New notes length:', cleanSummary.length, 'characters');
            console.log('   Reduction:', currentNotes.length - cleanSummary.length, 'characters removed');
            const { error: updateError } = await supabase_client_1.default
                .from('leads')
                .update({
                custom_fields: updatedCustomFields,
                updated_at: new Date().toISOString()
            })
                .eq('id', lead.id);
            if (updateError) {
                console.error('❌ Update error:', updateError);
            }
            else {
                console.log('\n✅ Successfully cleaned Matt\'s notes!');
                console.log('📊 Summary: Removed duplicates and created single concise call summary');
            }
        }
        else {
            console.log('ℹ️ No notes found in custom_fields');
        }
    }
    catch (error) {
        console.error('❌ Error:', error);
    }
}
console.log('🚀 Starting notes cleanup for Matt\'s lead');
fixMattNotes()
    .then(() => {
    console.log('\n✅ Cleanup complete!');
    process.exit(0);
})
    .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
});
