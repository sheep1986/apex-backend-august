"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
async function checkAndCleanAllNotes() {
    console.log('🔍 Checking ALL leads for duplicate notes...\n');
    try {
        const { data: leads, error } = await supabase_client_1.default
            .from('leads')
            .select('id, first_name, last_name, phone, notes, custom_fields')
            .not('notes', 'is', null);
        if (error) {
            console.error('Error fetching leads:', error);
            return;
        }
        console.log(`📊 Found ${leads?.length || 0} leads with notes\n`);
        let totalCleaned = 0;
        for (const lead of leads || []) {
            console.log(`\n📋 Lead: ${lead.first_name} ${lead.last_name || ''} (${lead.phone})`);
            console.log(`   ID: ${lead.id}`);
            if (lead.notes) {
                console.log(`   ⚠️ Found data in old 'notes' column - removing...`);
                const { error: clearError } = await supabase_client_1.default
                    .from('leads')
                    .update({
                    notes: null,
                    updated_at: new Date().toISOString()
                })
                    .eq('id', lead.id);
                if (!clearError) {
                    console.log(`   ✅ Cleared old notes column`);
                    totalCleaned++;
                }
                else {
                    console.log(`   ❌ Error clearing notes:`, clearError);
                }
            }
            if (lead.custom_fields?.notes) {
                const currentNotes = lead.custom_fields.notes;
                console.log(`   📝 Custom fields notes length: ${currentNotes.length} chars`);
                const lines = currentNotes.split('\n');
                const uniqueLines = [...new Set(lines)];
                if (lines.length > uniqueLines.length * 1.5) {
                    console.log(`   ⚠️ Detected duplicates: ${lines.length} lines → ${uniqueLines.length} unique`);
                    let cleanSummary = '';
                    const phoneMatch = currentNotes.match(/CONTACT:.*?(\+?\d+)/);
                    const addressMatch = currentNotes.match(/ADDRESS:.*?([^•\n]+)/);
                    const interestMatch = currentNotes.match(/Interest Level:.*?(\d+\/10)/);
                    const appointmentMatch = currentNotes.match(/APPOINTMENT:.*?([^•\n]+)/);
                    const companyMatch = currentNotes.match(/Company Calling:.*?([^•\n]+)|COMPANY CALLING:.*?([^•\n]+)/i);
                    cleanSummary = `📞 CALL SUMMARY\n`;
                    if (lead.first_name || lead.phone) {
                        cleanSummary += `\n👤 CONTACT: ${lead.first_name} ${lead.last_name || ''} | ${lead.phone}`;
                    }
                    if (addressMatch) {
                        cleanSummary += `\n📍 ADDRESS: ${addressMatch[1].trim()}`;
                    }
                    if (interestMatch) {
                        cleanSummary += `\n\n✅ QUALIFICATION:\n• Interest Level: ${interestMatch[1]}`;
                    }
                    if (appointmentMatch) {
                        cleanSummary += `\n\n📅 APPOINTMENT: ${appointmentMatch[1].trim()}`;
                    }
                    if (companyMatch) {
                        cleanSummary += `\n\n📌 NOTE: ${(companyMatch[1] || companyMatch[2]).trim()} called this prospect`;
                    }
                    const updatedCustomFields = {
                        ...lead.custom_fields,
                        notes: cleanSummary
                    };
                    const { error: updateError } = await supabase_client_1.default
                        .from('leads')
                        .update({
                        custom_fields: updatedCustomFields,
                        updated_at: new Date().toISOString()
                    })
                        .eq('id', lead.id);
                    if (!updateError) {
                        console.log(`   ✅ Cleaned and reduced from ${currentNotes.length} to ${cleanSummary.length} chars`);
                        totalCleaned++;
                    }
                    else {
                        console.log(`   ❌ Error updating:`, updateError);
                    }
                }
                else {
                    console.log(`   ✓ Notes appear clean`);
                }
            }
        }
        console.log('\n' + '='.repeat(60));
        console.log(`\n📊 SUMMARY:`);
        console.log(`   Total leads checked: ${leads?.length || 0}`);
        console.log(`   Leads cleaned: ${totalCleaned}`);
        console.log(`\n✅ Cleanup complete!`);
    }
    catch (error) {
        console.error('❌ Error:', error);
    }
}
console.log('🚀 Starting comprehensive notes cleanup\n');
checkAndCleanAllNotes()
    .then(() => {
    process.exit(0);
})
    .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
});
