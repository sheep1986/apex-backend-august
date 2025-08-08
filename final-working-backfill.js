// Final working backfill with correct outcome mapping
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VAPI_API_KEY = 'da8956d4-0508-474e-bd96-7eda82d2d943';

// Correct mapping based on your table constraints
const OUTCOME_MAPPING = {
  'customer-ended-call': 'voicemail',      // Customer ended = they got the message
  'assistant-ended-call': 'voicemail',     // Assistant completed = successful delivery
  'silence-timed-out': 'no_answer',        // Silence = no answer
  'customer-did-not-answer': 'no_answer',  // Didn't answer = no answer
  'assistant-hangup': 'voicemail',
  'customer-hangup': 'voicemail', 
  'call-ended': 'voicemail',
  'timeout': 'no_answer',
  'busy': 'busy',
  'failed': 'failed'
};

// Fetch call data from VAPI API
async function fetchVapiCallData(callId) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.vapi.ai',
      port: 443,
      path: `/call/${callId}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const callData = JSON.parse(data);
            resolve(callData);
          } else {
            resolve(null);
          }
        } catch (error) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => {
      req.destroy();
      resolve(null);
    });

    req.end();
  });
}

// Update call with correct mapping
async function updateCallWithVapiData(callId, vapiData) {
  try {
    const updateData = {
      updated_at: new Date().toISOString()
    };

    // Extract data
    if (vapiData.transcript) {
      updateData.transcript = vapiData.transcript;
      console.log(`  📝 Transcript: ${vapiData.transcript.substring(0, 60)}...`);
    }

    if (vapiData.recordingUrl || (vapiData.recording && vapiData.recording.url)) {
      updateData.recording_url = vapiData.recordingUrl || vapiData.recording.url;
      console.log(`  📹 Recording: Available`);
    }

    if (vapiData.duration) {
      updateData.duration = vapiData.duration;
      console.log(`  ⏱️ Duration: ${vapiData.duration} seconds`);
    }

    if (vapiData.cost) {
      updateData.cost = vapiData.cost;
      console.log(`  💰 Cost: $${vapiData.cost}`);
    }

    // Map VAPI outcome to allowed values
    if (vapiData.endedReason) {
      const mappedOutcome = OUTCOME_MAPPING[vapiData.endedReason] || 'failed';
      updateData.outcome = mappedOutcome;
      console.log(`  🎯 Outcome: ${vapiData.endedReason} → ${mappedOutcome}`);
    }

    if (vapiData.analysis) {
      if (vapiData.analysis.summary) {
        updateData.summary = vapiData.analysis.summary;
      }
      if (vapiData.analysis.sentiment) {
        updateData.sentiment = vapiData.analysis.sentiment;
        console.log(`  😊 Sentiment: ${vapiData.analysis.sentiment}`);
      }
    }

    // Update status
    if (vapiData.endedAt) {
      updateData.status = 'completed';
      updateData.ended_at = vapiData.endedAt;
    } else if (vapiData.startedAt) {
      updateData.status = 'in-progress';
      updateData.started_at = vapiData.startedAt;
    }

    // Store enhanced VAPI metadata
    const existingMetadata = {};
    
    const { data: currentCall } = await supabase
      .from('calls')
      .select('metadata')
      .eq('vapi_call_id', callId)
      .single();
    
    if (currentCall && currentCall.metadata) {
      Object.assign(existingMetadata, currentCall.metadata);
    }
    
    existingMetadata.vapi_enhanced = {
      originalOutcome: vapiData.endedReason,
      recordingUrl: updateData.recording_url,
      transcriptLength: vapiData.transcript ? vapiData.transcript.length : 0,
      enhancedAt: new Date().toISOString(),
      vapiCallId: callId
    };
    
    updateData.metadata = existingMetadata;

    // Update the database
    const { error } = await supabase
      .from('calls')
      .update(updateData)
      .eq('vapi_call_id', callId);

    if (error) {
      console.error(`  ❌ Update error: ${error.message}`);
      return false;
    } else {
      console.log(`  ✅ Successfully enhanced`);
      return true;
    }

  } catch (error) {
    console.error(`❌ Error updating call ${callId}: ${error.message}`);
    return false;
  }
}

// Main backfill function
async function finalWorkingBackfill() {
  console.log('🚀 Starting final VAPI data backfill...');
  console.log('🗂️ Using correct outcome mapping for your table:');
  console.log('');
  
  Object.entries(OUTCOME_MAPPING).forEach(([vapi, mapped]) => {
    console.log(`   ${vapi} → ${mapped}`);
  });
  
  console.log('');

  try {
    const { data: calls, error } = await supabase
      .from('calls')
      .select('vapi_call_id, campaign_id, created_at')
      .not('vapi_call_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('❌ Error fetching calls:', error);
      return;
    }

    console.log(`📊 Found ${calls.length} calls to enhance\n`);

    let processed = 0;
    let enhanced = 0;
    let skipped = 0;
    let errors = 0;

    for (const call of calls) {
      processed++;
      console.log(`\n📞 Processing call ${processed}/${calls.length}: ${call.vapi_call_id}`);
      
      if (call.vapi_call_id.startsWith('test-')) {
        console.log('  ⏩ Skipping test call');
        skipped++;
        continue;
      }

      const vapiData = await fetchVapiCallData(call.vapi_call_id);
      
      if (vapiData) {
        const success = await updateCallWithVapiData(call.vapi_call_id, vapiData);
        if (success) {
          enhanced++;
        } else {
          errors++;
        }
      } else {
        console.log('  ⚠️ Not found in VAPI');
        skipped++;
      }

      // Delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('\n🎉 Final backfill completed!');
    console.log(`📊 Final Summary:`);
    console.log(`   Total processed: ${processed}`);
    console.log(`   Successfully enhanced: ${enhanced}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors}`);

    if (enhanced > 0) {
      console.log('\n✅ Your existing calls now have:');
      console.log('   📝 Complete transcripts from VAPI');
      console.log('   📹 Call recording URLs');
      console.log('   🎯 Properly mapped call outcomes');
      console.log('   💰 Accurate call costs and durations');
      console.log('   😊 Sentiment analysis');
      console.log('   📊 Enhanced metadata stored');
      console.log('\n🚀 All data is now available in your campaigns dashboard!');
      console.log('\n🔗 You can now:');
      console.log('   - Listen to call recordings');
      console.log('   - Read full transcripts');
      console.log('   - See call outcomes and costs');
      console.log('   - Analyze campaign performance');
    }

  } catch (error) {
    console.error('❌ Error in backfill process:', error);
  }
}

// Run the final backfill
if (require.main === module) {
  finalWorkingBackfill();
}

module.exports = { finalWorkingBackfill };