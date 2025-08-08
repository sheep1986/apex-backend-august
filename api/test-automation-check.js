import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkLatestCalls() {
  console.log('🔍 Checking latest calls for automation...\n');
  
  try {
    // Get the 5 most recent calls
    const { data: calls, error } = await supabase
      .from('calls')
      .select(`
        id,
        created_at,
        updated_at,
        status,
        outcome,
        duration,
        transcript,
        sentiment,
        ai_confidence_score,
        is_qualified_lead,
        qualification_status,
        summary,
        customer_name,
        vapi_call_id
      `)
      .order('created_at', { ascending: false })
      .limit(5);
      
    if (error) {
      console.error('Error fetching calls:', error);
      return;
    }
    
    console.log(`Found ${calls.length} recent calls:\n`);
    
    calls.forEach((call, index) => {
      const createdTime = new Date(call.created_at);
      const updatedTime = new Date(call.updated_at);
      const processingTime = (updatedTime - createdTime) / 1000; // seconds
      
      console.log(`${index + 1}. Call ${call.id.substring(0, 8)}...`);
      console.log(`   Customer: ${call.customer_name || 'Unknown'}`);
      console.log(`   Created: ${createdTime.toLocaleString()}`);
      console.log(`   Updated: ${updatedTime.toLocaleString()}`);
      console.log(`   Processing Time: ${processingTime.toFixed(1)} seconds`);
      console.log(`   Status: ${call.status}`);
      console.log(`   Outcome: ${call.outcome}`);
      console.log(`   Duration: ${call.duration}s`);
      console.log(`   Has Transcript: ${call.transcript ? 'Yes' : 'No'}`);
      console.log(`   AI Score: ${call.ai_confidence_score || 'Not set'}`);
      console.log(`   Sentiment: ${call.sentiment || 'Not analyzed'}`);
      console.log(`   Qualified: ${call.is_qualified_lead ? 'Yes' : 'No'}`);
      console.log(`   Has Summary: ${call.summary ? 'Yes' : 'No'}`);
      
      // Check if this was processed automatically
      if (processingTime < 60 && call.transcript && call.ai_confidence_score > 0) {
        console.log(`   ✅ AUTOMATED PROCESSING DETECTED`);
      } else if (processingTime > 3600) {
        console.log(`   ❌ MANUAL PROCESSING (processed ${(processingTime/3600).toFixed(1)} hours later)`);
      } else {
        console.log(`   ⚠️  UNCLEAR (check backend logs)`);
      }
      
      console.log('');
    });
    
  } catch (err) {
    console.error('Error:', err);
  }
}

// Run check every 10 seconds to monitor new calls
console.log('Monitoring for new calls... (Press Ctrl+C to stop)\n');
checkLatestCalls();
setInterval(checkLatestCalls, 10000);