"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const enhanced_ai_processor_1 = require("../services/enhanced-ai-processor");
async function reprocessAllLeads() {
    console.log('🔄 Starting lead reprocessing with new AI brief format...\n');
    try {
        const { data: leads, error: leadsError } = await supabase_client_1.default
            .from('leads')
            .select('*, calls!lead_id(*)')
            .order('created_at', { ascending: false });
        if (leadsError) {
            console.error('❌ Error fetching leads:', leadsError);
            return;
        }
        if (!leads || leads.length === 0) {
            console.log('ℹ️ No leads found to reprocess');
            return;
        }
        console.log(`📊 Found ${leads.length} leads to reprocess\n`);
        let successCount = 0;
        let errorCount = 0;
        for (const lead of leads) {
            try {
                console.log(`Processing lead: ${lead.first_name} ${lead.last_name} (${lead.id})`);
                const recentCall = lead.calls
                    ?.filter((call) => call.transcript || call.transcription)
                    ?.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
                if (!recentCall) {
                    console.log(`  ⚠️ No call with transcript found for lead ${lead.id}`);
                    continue;
                }
                const transcript = recentCall.transcript || recentCall.transcription;
                console.log(`  🤖 Running AI analysis...`);
                const result = await enhanced_ai_processor_1.EnhancedAIProcessor.processCall(recentCall.id, transcript, recentCall.vapi_data);
                if (result) {
                    console.log(`  ✅ Successfully reprocessed lead ${lead.id}`);
                    successCount++;
                }
                else {
                    console.log(`  ⚠️ No result from AI processor for lead ${lead.id}`);
                    errorCount++;
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            catch (error) {
                console.error(`  ❌ Error processing lead ${lead.id}:`, error);
                errorCount++;
            }
        }
        console.log('\n📊 Reprocessing Complete!');
        console.log(`✅ Successfully reprocessed: ${successCount} leads`);
        console.log(`❌ Errors encountered: ${errorCount} leads`);
    }
    catch (error) {
        console.error('❌ Fatal error during reprocessing:', error);
    }
}
async function reprocessSpecificLeads(leadIds) {
    console.log(`🔄 Reprocessing ${leadIds.length} specific leads...\n`);
    for (const leadId of leadIds) {
        try {
            const { data: lead, error: leadError } = await supabase_client_1.default
                .from('leads')
                .select('*, calls!lead_id(*)')
                .eq('id', leadId)
                .single();
            if (leadError || !lead) {
                console.error(`❌ Lead ${leadId} not found`);
                continue;
            }
            console.log(`Processing lead: ${lead.first_name} ${lead.last_name}`);
            const recentCall = lead.calls
                ?.filter((call) => call.transcript || call.transcription)
                ?.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
            if (!recentCall) {
                console.log(`  ⚠️ No call with transcript found`);
                continue;
            }
            const transcript = recentCall.transcript || recentCall.transcription;
            console.log(`  🤖 Running AI analysis...`);
            const result = await enhanced_ai_processor_1.EnhancedAIProcessor.processCall(recentCall.id, transcript, recentCall.vapi_data);
            if (result) {
                console.log(`  ✅ Successfully reprocessed`);
                const { data: updatedLead } = await supabase_client_1.default
                    .from('leads')
                    .select('custom_fields')
                    .eq('id', leadId)
                    .single();
                if (updatedLead?.custom_fields?.notes?.[0]) {
                    console.log('\n📝 New AI Summary:');
                    console.log('─'.repeat(50));
                    console.log(updatedLead.custom_fields.notes[0].content);
                    console.log('─'.repeat(50));
                }
            }
        }
        catch (error) {
            console.error(`❌ Error processing lead ${leadId}:`, error);
        }
    }
}
const args = process.argv.slice(2);
if (args.length > 0 && args[0] === '--lead') {
    const leadIds = args.slice(1);
    if (leadIds.length === 0) {
        console.error('❌ Please provide lead IDs after --lead flag');
        console.log('Usage: ts-node reprocess-all-leads.ts --lead <lead-id-1> <lead-id-2> ...');
        process.exit(1);
    }
    reprocessSpecificLeads(leadIds)
        .then(() => {
        console.log('\n✅ Specific lead reprocessing complete!');
        process.exit(0);
    })
        .catch((error) => {
        console.error('❌ Reprocessing failed:', error);
        process.exit(1);
    });
}
else if (args.length > 0 && args[0] === '--test') {
    console.log('🧪 TEST MODE: Processing only the first lead...\n');
    supabase_client_1.default
        .from('leads')
        .select('id')
        .limit(1)
        .then(({ data }) => {
        if (data && data[0]) {
            return reprocessSpecificLeads([data[0].id]);
        }
        else {
            console.log('No leads found to test');
        }
    })
        .then(() => {
        console.log('\n✅ Test complete!');
        process.exit(0);
    })
        .catch((error) => {
        console.error('❌ Test failed:', error);
        process.exit(1);
    });
}
else {
    console.log('⚠️  This will reprocess ALL leads in the database.');
    console.log('This may take a while and will use OpenAI API credits.\n');
    console.log('Options:');
    console.log('  --test              Process only the first lead as a test');
    console.log('  --lead <id1> <id2>  Process specific leads by ID\n');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
    setTimeout(() => {
        reprocessAllLeads()
            .then(() => {
            console.log('\n✅ All leads reprocessed successfully!');
            process.exit(0);
        })
            .catch((error) => {
            console.error('❌ Reprocessing failed:', error);
            process.exit(1);
        });
    }, 5000);
}
