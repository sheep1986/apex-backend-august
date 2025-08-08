"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
async function fixNotesFormat() {
    console.log('🔧 Fixing notes format (string → array)...\n');
    try {
        const { data: leads, error } = await supabase_client_1.default
            .from('leads')
            .select('id, first_name, last_name, phone, custom_fields')
            .not('custom_fields', 'is', null);
        if (error) {
            console.error('Error fetching leads:', error);
            return;
        }
        console.log(`📊 Found ${leads?.length || 0} leads with custom_fields\n`);
        let totalFixed = 0;
        for (const lead of leads || []) {
            if (lead.custom_fields?.notes) {
                const currentNotes = lead.custom_fields.notes;
                if (typeof currentNotes === 'string') {
                    console.log(`\n📋 Lead: ${lead.first_name} ${lead.last_name || ''}`);
                    console.log(`   Phone: ${lead.phone}`);
                    console.log(`   Converting string notes to array format...`);
                    const noteObject = {
                        id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        content: currentNotes,
                        createdBy: 'AI System',
                        createdAt: new Date().toISOString(),
                        lastUpdated: new Date().toISOString(),
                        tag: 'general'
                    };
                    const updatedCustomFields = {
                        ...lead.custom_fields,
                        notes: [noteObject]
                    };
                    const { error: updateError } = await supabase_client_1.default
                        .from('leads')
                        .update({
                        custom_fields: updatedCustomFields,
                        updated_at: new Date().toISOString()
                    })
                        .eq('id', lead.id);
                    if (!updateError) {
                        console.log(`   ✅ Converted to array format`);
                        totalFixed++;
                    }
                    else {
                        console.log(`   ❌ Error updating:`, updateError.message);
                    }
                }
                else if (Array.isArray(currentNotes)) {
                    console.log(`   ✓ Lead ${lead.first_name}: Notes already in array format (${currentNotes.length} notes)`);
                    const uniqueNotes = currentNotes.reduce((acc, note) => {
                        const isDuplicate = acc.some((existingNote) => existingNote.content === note.content ||
                            (existingNote.content && note.content &&
                                existingNote.content.substring(0, 50) === note.content.substring(0, 50)));
                        if (!isDuplicate) {
                            acc.push(note);
                        }
                        return acc;
                    }, []);
                    if (uniqueNotes.length < currentNotes.length) {
                        console.log(`   ⚠️ Found ${currentNotes.length - uniqueNotes.length} duplicate notes - removing...`);
                        const updatedCustomFields = {
                            ...lead.custom_fields,
                            notes: uniqueNotes
                        };
                        const { error: updateError } = await supabase_client_1.default
                            .from('leads')
                            .update({
                            custom_fields: updatedCustomFields,
                            updated_at: new Date().toISOString()
                        })
                            .eq('id', lead.id);
                        if (!updateError) {
                            console.log(`   ✅ Removed duplicates`);
                            totalFixed++;
                        }
                    }
                }
                else {
                    console.log(`   ⚠️ Lead ${lead.first_name}: Unknown notes format`);
                }
            }
        }
        console.log('\n' + '='.repeat(60));
        console.log(`\n📊 SUMMARY:`);
        console.log(`   Total leads checked: ${leads?.length || 0}`);
        console.log(`   Leads fixed: ${totalFixed}`);
    }
    catch (error) {
        console.error('❌ Error:', error);
    }
}
console.log('🚀 Starting notes format fix\n');
fixNotesFormat()
    .then(() => {
    console.log('\n✅ Format fix complete!');
    process.exit(0);
})
    .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
});
