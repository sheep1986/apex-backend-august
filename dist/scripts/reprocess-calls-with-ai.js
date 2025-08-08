"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const enhanced_ai_processor_1 = require("../services/enhanced-ai-processor");
async function reprocessExistingCalls() {
    console.log('🔄 Starting reprocessing of existing calls with enhanced AI...');
    try {
        const { data: calls, error } = await supabase_client_1.default
            .from('calls')
            .select('*')
            .not('transcript', 'is', null)
            .order('created_at', { ascending: false })
            .limit(100);
        if (error) {
            console.error('❌ Error fetching calls:', error);
            return;
        }
        console.log(`📊 Found ${calls?.length || 0} calls to reprocess`);
        if (!calls || calls.length === 0) {
            console.log('No calls with transcripts found');
            return;
        }
        let processed = 0;
        let updated = 0;
        let failed = 0;
        for (const call of calls) {
            try {
                console.log(`\n🔍 Processing call ${call.id}`);
                console.log(`   Customer: ${call.customer_name || 'Unknown'}`);
                console.log(`   Phone: ${call.customer_phone || 'Unknown'}`);
                console.log(`   Current Email: ${call.customer_email || 'None'}`);
                console.log(`   Current Company: ${call.customer_company || 'None'}`);
                console.log(`   Transcript Length: ${call.transcript?.length || 0} chars`);
                if (!call.transcript || call.transcript.length < 50) {
                    console.log('   ⚠️ Skipping - no valid transcript');
                    continue;
                }
                const vapiData = {
                    id: call.vapi_call_id || call.id,
                    duration: call.duration,
                    customer: {
                        name: call.customer_name,
                        number: call.customer_phone
                    },
                    summary: call.summary,
                    analysis: call.analysis,
                    transcript: call.transcript
                };
                console.log('   🤖 Running enhanced AI extraction...');
                const extracted = await enhanced_ai_processor_1.EnhancedAIProcessor.processCall(call.id, call.transcript, vapiData);
                if (extracted) {
                    console.log('   ✅ Extraction complete:');
                    if (extracted.email)
                        console.log(`      Email: ${extracted.email}`);
                    if (extracted.company)
                        console.log(`      Company: ${extracted.company}`);
                    if (extracted.address)
                        console.log(`      Address: ${extracted.address}`);
                    if (extracted.jobTitle)
                        console.log(`      Job Title: ${extracted.jobTitle}`);
                    if (extracted.budget)
                        console.log(`      Budget: ${extracted.budget}`);
                    if (extracted.timeline)
                        console.log(`      Timeline: ${extracted.timeline}`);
                    if (extracted.interestLevel)
                        console.log(`      Interest: ${extracted.interestLevel}/10`);
                    updated++;
                }
                processed++;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            catch (error) {
                console.error(`   ❌ Failed to process call ${call.id}:`, error);
                failed++;
            }
        }
        console.log('\n📊 Reprocessing Complete:');
        console.log(`   Total Calls: ${calls.length}`);
        console.log(`   Processed: ${processed}`);
        console.log(`   Updated: ${updated}`);
        console.log(`   Failed: ${failed}`);
        console.log('\n🔄 Updating leads with extracted information...');
        await updateLeadsWithExtractedInfo();
    }
    catch (error) {
        console.error('❌ Fatal error during reprocessing:', error);
    }
}
async function updateLeadsWithExtractedInfo() {
    try {
        const { data: leads, error } = await supabase_client_1.default
            .from('leads')
            .select('*')
            .or('email.is.null,company.is.null,address.is.null')
            .limit(50);
        if (error) {
            console.error('❌ Error fetching leads:', error);
            return;
        }
        console.log(`📋 Found ${leads?.length || 0} leads missing information`);
        if (!leads || leads.length === 0) {
            return;
        }
        for (const lead of leads) {
            const { data: calls, error: callError } = await supabase_client_1.default
                .from('calls')
                .select('*')
                .eq('customer_phone', lead.phone)
                .order('created_at', { ascending: false })
                .limit(1);
            if (callError || !calls || calls.length === 0) {
                continue;
            }
            const call = calls[0];
            const updates = {};
            if (!lead.email && call.customer_email) {
                updates.email = call.customer_email;
            }
            if (!lead.company && call.customer_company) {
                updates.company = call.customer_company;
            }
            if (!lead.address && call.address) {
                updates.address = call.address;
            }
            if (call.qualification_details) {
                const details = typeof call.qualification_details === 'string'
                    ? JSON.parse(call.qualification_details)
                    : call.qualification_details;
                if (!lead.job_title && details.jobTitle) {
                    updates.job_title = details.jobTitle;
                }
                if (!lead.budget && details.budget) {
                    updates.budget = details.budget;
                }
                if (!lead.timeline && details.timeline) {
                    updates.timeline = details.timeline;
                }
            }
            if (Object.keys(updates).length > 0) {
                updates.updated_at = new Date().toISOString();
                const { error: updateError } = await supabase_client_1.default
                    .from('leads')
                    .update(updates)
                    .eq('id', lead.id);
                if (updateError) {
                    console.error(`❌ Error updating lead ${lead.id}:`, updateError);
                }
                else {
                    console.log(`✅ Updated lead ${lead.first_name} ${lead.last_name}:`, updates);
                }
            }
        }
    }
    catch (error) {
        console.error('❌ Error updating leads:', error);
    }
}
console.log('🚀 Starting Enhanced AI Reprocessing Script');
console.log('📝 This will extract missing information from existing call transcripts');
console.log('⏰ This may take a few minutes depending on the number of calls...\n');
reprocessExistingCalls()
    .then(() => {
    console.log('\n✅ Reprocessing complete!');
    process.exit(0);
})
    .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
});
