"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const enhanced_ai_processor_1 = require("../services/enhanced-ai-processor");
const supabase_client_1 = __importDefault(require("../services/supabase-client"));
const SAMPLE_TRANSCRIPT = `
Sales Rep: Hello, is this Matt?

Matt: Yes, speaking.

Sales Rep: Hi Matt, this is Sarah from Apex Solar Solutions. Our field representative Tom visited you last week about our solar panel installation services. He mentioned you might be interested in learning more?

Matt: Oh yes, Tom was here. To be honest, solar is completely new to me. I wasn't really considering it before he stopped by.

Sales Rep: I understand completely. Many of our customers feel the same way initially. Tom noted that you qualified for our free consultation program. Would you be interested in having one of our specialists come by to do a roof inspection, review your energy bills, and provide a custom quote with no obligation?

Matt: Well, I suppose it wouldn't hurt to learn more. What does this involve exactly?

Sales Rep: Great question! The consultation takes about an hour. Our specialist will inspect your roof to see if it's suitable for solar, analyze your recent energy bills to calculate potential savings, and create a customized proposal showing costs and financing options. There's absolutely no deposit required and no pressure to commit.

Matt: And this is completely free?

Sales Rep: Yes, absolutely free. We believe in educating homeowners about their options. Even if you decide solar isn't right for you now, you'll have all the information for future reference.

Matt: Alright, that sounds reasonable. When could someone come by?

Sales Rep: Let me check our schedule. We have availability on Wednesday afternoon or Friday evening this week. What works better for you?

Matt: I can't do Wednesday. Friday evening would work - maybe around 6 PM?

Sales Rep: Perfect! I have you down for Friday at 6 PM. Just to confirm, your address is 47 Tree Towage, Glasgow, G11 3SU, Scotland?

Matt: That's correct.

Sales Rep: Excellent. Our specialist will call you 30 minutes before arrival. Is this the best number to reach you at?

Matt: Yes, this number is fine. Actually, can I get your contact details in case I need to reschedule or have questions?

Sales Rep: Of course! You can reach us at 0800-SOLAR-UK, that's 0800-765-2785. My name is Sarah Thompson, and I'm extension 142. I'll also send you a confirmation text with all these details.

Matt: That's helpful, thank you. Just to be clear, there's no obligation to buy anything?

Sales Rep: Absolutely no obligation. This is purely educational. Our specialist will show you the numbers, and you can take as much time as you need to make a decision. Many customers think about it for weeks or even months before moving forward.

Matt: Okay, that sounds good. I'll see your specialist on Friday then.

Sales Rep: Perfect! You'll receive a confirmation text shortly, and we'll call you Friday afternoon before the appointment. Have a great day, Matt!

Matt: Thanks, you too. Bye.

Sales Rep: Goodbye!
`;
async function testAIBrief() {
    console.log('🧪 Testing AI Brief Generation\n');
    console.log('📝 Using sample transcript from Matt\'s solar consultation call\n');
    console.log('─'.repeat(60));
    try {
        const { data: orgs } = await supabase_client_1.default.from('organizations').select('id').limit(1);
        const { data: campaigns } = await supabase_client_1.default.from('campaigns').select('id').limit(1);
        const mockCall = {
            organization_id: orgs?.[0]?.id || null,
            campaign_id: campaigns?.[0]?.id || null,
            customer_phone: '+44 7xxx xxxxxx',
            customer_name: 'Matt',
            transcript: SAMPLE_TRANSCRIPT,
            duration: 180,
            cost: 0.15,
            status: 'completed',
            outcome: 'interested',
            created_at: new Date().toISOString()
        };
        const { data: insertedCall, error: insertError } = await supabase_client_1.default
            .from('calls')
            .insert(mockCall)
            .select()
            .single();
        if (insertError) {
            console.error('❌ Error creating test call:', insertError);
            return;
        }
        console.log('✅ Test call created: ' + insertedCall.id);
        console.log('\n🤖 Running AI processing...\n');
        const result = await enhanced_ai_processor_1.EnhancedAIProcessor.processCall(insertedCall.id, SAMPLE_TRANSCRIPT, null);
        if (result) {
            console.log('✅ AI processing complete!\n');
            const { data: lead } = await supabase_client_1.default
                .from('leads')
                .select('*')
                .eq('phone', mockCall.customer_phone)
                .single();
            if (lead?.custom_fields?.notes?.[0]) {
                console.log('📋 Generated Pre-Call Brief:');
                console.log('═'.repeat(60));
                console.log(lead.custom_fields.notes[0].content);
                console.log('═'.repeat(60));
                console.log('\n📊 Extracted Information:');
                console.log('─'.repeat(40));
                console.log(`Name: ${lead.first_name} ${lead.last_name}`);
                console.log(`Phone: ${lead.phone}`);
                console.log(`Status: ${lead.status}`);
                console.log(`Score: ${lead.score}/100`);
                if (lead.custom_fields) {
                    console.log(`\nAddress:`);
                    console.log(`  Street: ${lead.custom_fields.address?.street || 'N/A'}`);
                    console.log(`  City: ${lead.custom_fields.address?.city || 'N/A'}`);
                    console.log(`  State: ${lead.custom_fields.address?.state || 'N/A'}`);
                    console.log(`  ZIP: ${lead.custom_fields.address?.zipCode || 'N/A'}`);
                    console.log(`  Country: ${lead.custom_fields.address?.country || 'N/A'}`);
                    console.log(`\nQualification:`);
                    console.log(`  Interest Level: ${lead.custom_fields.interest_level || 'N/A'}/10`);
                    console.log(`  Budget: ${lead.custom_fields.budget || 'Not discussed'}`);
                    console.log(`  Timeline: ${lead.custom_fields.timeline || 'Not specified'}`);
                    if (lead.custom_fields.appointment) {
                        console.log(`\nAppointment:`);
                        console.log(`  Date: ${lead.custom_fields.appointment.date || 'N/A'}`);
                        console.log(`  Time: ${lead.custom_fields.appointment.time || 'N/A'}`);
                        console.log(`  Type: ${lead.custom_fields.appointment.type || 'N/A'}`);
                    }
                }
                await supabase_client_1.default.from('leads').delete().eq('id', lead.id);
            }
            else {
                console.log('⚠️ No AI summary generated');
            }
            await supabase_client_1.default.from('calls').delete().eq('id', insertedCall.id);
        }
        else {
            console.log('❌ AI processing returned no result');
        }
    }
    catch (error) {
        console.error('❌ Test failed:', error);
    }
}
async function testExistingCall(callId) {
    console.log(`🧪 Testing AI Brief Generation for existing call: ${callId}\n`);
    try {
        const { data: call, error: callError } = await supabase_client_1.default
            .from('calls')
            .select('*')
            .eq('id', callId)
            .single();
        if (callError || !call) {
            console.error('❌ Call not found:', callError);
            return;
        }
        const transcript = call.transcript || call.transcription;
        if (!transcript) {
            console.error('❌ No transcript found for this call');
            return;
        }
        console.log('📞 Call details:');
        console.log(`  Customer: ${call.customer_name || 'Unknown'}`);
        console.log(`  Phone: ${call.customer_phone}`);
        console.log(`  Date: ${new Date(call.created_at).toLocaleString()}`);
        console.log(`  Duration: ${call.duration || 'N/A'} seconds\n`);
        console.log('🤖 Running AI processing...\n');
        const result = await enhanced_ai_processor_1.EnhancedAIProcessor.processCall(call.id, transcript, null);
        if (result) {
            console.log('✅ AI processing complete!\n');
            const { data: lead } = await supabase_client_1.default
                .from('leads')
                .select('*')
                .eq('phone', call.customer_phone)
                .single();
            if (lead?.custom_fields?.notes?.[0]) {
                console.log('📋 Generated Pre-Call Brief:');
                console.log('═'.repeat(60));
                console.log(lead.custom_fields.notes[0].content);
                console.log('═'.repeat(60));
            }
        }
    }
    catch (error) {
        console.error('❌ Test failed:', error);
    }
}
const args = process.argv.slice(2);
if (args.length > 0 && args[0] === '--call') {
    const callId = args[1];
    if (!callId) {
        console.error('❌ Please provide a call ID');
        console.log('Usage: ts-node test-ai-brief.ts --call <call-id>');
        process.exit(1);
    }
    testExistingCall(callId)
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
    testAIBrief()
        .then(() => {
        console.log('\n✅ Test complete!');
        process.exit(0);
    })
        .catch((error) => {
        console.error('❌ Test failed:', error);
        process.exit(1);
    });
}
