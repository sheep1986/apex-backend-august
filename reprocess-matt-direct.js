require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function reprocessMattCall() {
  const mattCallId = 'fdbfcfa2-7a01-4f7c-b162-95ca182f8f8f';
  
  // First, reset the call status to trigger reprocessing
  console.log('Resetting Matt\'s call for reprocessing...\n');
  
  const { error: resetError } = await supabase
    .from('calls')
    .update({
      // Clear AI-extracted fields to see if they get populated
      address: null,
      customer_email: null,
      summary: null,
      ai_confidence_score: 0,
      contact_info: null,
      appointment_details: null,
      status: 'pending',
      updated_at: new Date().toISOString()
    })
    .eq('id', mattCallId);
    
  if (resetError) {
    console.error('Reset error:', resetError);
    return;
  }
  
  console.log('Call reset. Now triggering AI processing...\n');
  
  // Import and call the AI processor directly
  const { processCallWithAI } = require('./services/ai-call-processor');
  
  const mattTranscript = `User: Hello?
AI: Hello. Is it possible to speak to Matt, please?
User: Speaking.
AI: Hi, Matt. This is Joanne calling from Emerald Green Energy. You spoke to 1 of our reps recently who was in your area about solar energy for your property. Does that sound familiar?
User: That's correct.
AI: Great. Thanks for confirming. I hope you've been enjoying the nice weather. So just to check, is solar something you'd considered before our rep visit or was it more of a new idea when they spoke to you?
User: That's a new idea.
AI: Completely understandable. We installed tier 1 panels and battery systems with built in finance so you can start saving from day 1 without a big deposit. A lot of people are just starting to look into it now, especially with energy prices being what they are. Well, the good news is you've qualified to receive 1 of our free no pressure consultations with our solar advisers. They'll inspect your roof, review your energy usage, and prepare a custom quote. No obligation at all. Looking at my calendar, we could schedule you for Wednesday at 6 PM. Does that work for you?
User: No. I can't do Wednesday. I'm afraid.
AI: No problem at all, Matt. What day or time would suit better this week? We're quite flexible, so just let me know what works best for you.
User: Can you do the evenings?
AI: Absolutely. We can do evenings. What about Thursday or Friday around 6 or 7 PM, or is there another evening that works better for you?
User: Friday at 6. That's fine. Thank you.
AI: Perfect. Friday at 6 PM, it is. I'll get that booked in for you, and you'll receive a confirmation shortly by email or text. And just so I don't send our agents to the wrong address, could you please confirm the first line of your address and your postcode for me?
User: Yep. 47
AI: Thanks, Madhya.
User: Tree Towage.
AI: Thanks, Matt. And could you just confirm your postcode as well? That way, I can make sure everything's spot on for Friday.
User: G 11 and 3 s u.
AI: Brilliant. Thanks for that, Matt. So that's 47 Tree Towage. G 11 3 s u. You're all set for your free solar consultation this Friday at 6 PM. Do you have any questions at all about the visit solar panels or how the whole process works? I'm happy to help.
User: Yeah. Can I just take your name, please, and a a a contact number? So I can get back to you.
AI: Of course, Matt. My name is Joanne, and I'm calling on behalf of Emerald Green Energy, Our main contact number is 0 8 0 0 1 2 3 4 5 6 7. If you need to reach us or have any questions before your appointment, just give us a ring and mention your booking for Friday at 6 PM. Is there anything else I can help with right now?
User: No. You've been very helpful. Thank you very much.
AI: You're very welcome, Matt. It was lovely speaking with you, and thanks for your time. We'll see you Friday at 6 PM for your free solar consultation. If anything comes up or you need to reschedule, just give us a call. Have a great rest of your day.
User: Alright. Awesome. Thank you. Bye.`;

  const vapiCallData = {
    id: mattCallId,
    status: 'ended',
    duration: 180,
    transcript: mattTranscript,
    customer: {
      number: '+35677161714',
      name: 'Matt'
    }
  };
  
  try {
    await processCallWithAI(mattCallId, vapiCallData);
    console.log('AI processing triggered!\n');
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check the results
    const { data: call } = await supabase
      .from('calls')
      .select('*')
      .eq('id', mattCallId)
      .single();
      
    console.log('=== UPDATED CALL RECORD ===');
    console.log('Address:', call.address || 'NOT SAVED');
    console.log('Email:', call.customer_email || 'NOT SAVED');
    console.log('Company:', call.company || 'NOT SAVED');
    console.log('Appointment:', call.appointment_details || 'NOT SAVED');
    console.log('Summary:', call.summary ? 'YES' : 'NO');
    console.log('AI Score:', call.ai_confidence_score);
    console.log('Qualified:', call.is_qualified_lead);
    
    // Check if lead was created
    const { data: leads } = await supabase
      .from('leads')
      .select('*')
      .eq('phone', '+35677161714');
      
    console.log('\n=== LEADS IN CRM ===');
    if (leads && leads.length > 0) {
      leads.forEach(lead => {
        console.log('Lead ID:', lead.id);
        console.log('Name:', lead.first_name, lead.last_name);
        console.log('Phone:', lead.phone);
        console.log('Address:', lead.address || 'NOT SAVED');
        console.log('Email:', lead.email || 'NOT SAVED');
      });
    } else {
      console.log('No leads found');
    }
    
  } catch (error) {
    console.error('Processing error:', error);
  }
}

reprocessMattCall().catch(console.error);