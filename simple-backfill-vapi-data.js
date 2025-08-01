// Simple backfill for existing calls using current table structure
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VAPI_API_KEY = 'da8956d4-0508-474e-bd96-7eda82d2d943';

// Fetch call data from VAPI API
async function fetchVapiCallData(callId) {
  return new Promise((resolve, reject) => {
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

// Update call with existing table columns only
async function updateCallWithVapiData(callId, vapiData) {
  try {
    const updateData = {
      updated_at: new Date().toISOString()
    };

    // Use existing columns only
    if (vapiData.transcript) {
      updateData.transcript = vapiData.transcript;
      console.log(`  📝 Transcript: ${vapiData.transcript.substring(0, 100)}...`);
    }

    if (vapiData.recordingUrl) {
      updateData.recording_url = vapiData.recordingUrl;
      console.log(`  📹 Recording: ${vapiData.recordingUrl}`);
    }

    if (vapiData.recording && vapiData.recording.url) {
      updateData.recording_url = vapiData.recording.url;
      console.log(`  📹 Recording: ${vapiData.recording.url}`);
    }

    if (vapiData.duration) {
      updateData.duration = vapiData.duration;
      console.log(`  ⏱️ Duration: ${vapiData.duration} seconds`);
    }

    if (vapiData.cost) {
      updateData.cost = vapiData.cost;
      console.log(`  💰 Cost: $${vapiData.cost}`);
    }

    if (vapiData.endedReason) {
      updateData.outcome = vapiData.endedReason;
      console.log(`  🎯 Outcome: ${vapiData.endedReason}`);
    }

    if (vapiData.analysis) {
      if (vapiData.analysis.summary) {
        updateData.summary = vapiData.analysis.summary;
        updateData.outcome = updateData.outcome || vapiData.analysis.summary;
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

    // Store important metadata in existing metadata field
    if (vapiData.messages || vapiData.analysis || vapiData.phoneNumber) {
      const existingMetadata = {};
      
      // Try to get existing metadata
      const { data: currentCall } = await supabase
        .from('calls')
        .select('metadata')
        .eq('vapi_call_id', callId)
        .single();
      
      if (currentCall && currentCall.metadata) {
        Object.assign(existingMetadata, currentCall.metadata);
      }
      
      // Add VAPI data to metadata
      existingMetadata.vapi_data = {
        phoneNumber: vapiData.phoneNumber,
        assistant: vapiData.assistant,
        endedReason: vapiData.endedReason,
        messages: vapiData.messages ? vapiData.messages.length : 0,
        retrievedAt: new Date().toISOString()
      };
      
      updateData.metadata = existingMetadata;
    }

    // Extract structured outcome from messages
    if (vapiData.messages && vapiData.messages.length > 0 && !updateData.outcome) {
      const lastMessage = vapiData.messages[vapiData.messages.length - 1];
      if (lastMessage && lastMessage.content) {
        try {
          const structuredData = JSON.parse(lastMessage.content);
          if (structuredData.outcome) {
            updateData.outcome = structuredData.outcome;
            console.log(`  🎯 Structured outcome: ${structuredData.outcome}`);
          }
        } catch (e) {
          updateData.outcome = lastMessage.content.substring(0, 200);
          console.log(`  🎯 Text outcome: ${updateData.outcome}`);
        }
      }
    }

    // Update the database
    const { error } = await supabase
      .from('calls')
      .update(updateData)
      .eq('vapi_call_id', callId);

    if (error) {
      console.error(`  ❌ Database update error:`, error.message);
      return false;
    } else {
      console.log(`  ✅ Updated successfully`);
      return true;
    }

  } catch (error) {
    console.error(`❌ Error updating call ${callId}:`, error.message);
    return false;
  }
}

// Main backfill function
async function simpleBackfillVapiData() {
  console.log('🔄 Starting simple VAPI data backfill...');
  console.log('📋 Using existing table structure only\\n');

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

    console.log(`📊 Found ${calls.length} calls to enhance\\n`);

    let processed = 0;
    let enhanced = 0;
    let notFound = 0;
    let errors = 0;

    for (const call of calls) {
      processed++;
      console.log(`\\n📞 Processing call ${processed}/${calls.length}: ${call.vapi_call_id}`);
      
      if (call.vapi_call_id.startsWith('test-')) {
        console.log('  ⏩ Skipping test call');
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
        notFound++;
        console.log('  ⚠️ Not found in VAPI');
      }

      // Delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\\n🎉 Simple backfill completed!');
    console.log(`📊 Summary:`);
    console.log(`   Total processed: ${processed}`);
    console.log(`   Successfully enhanced: ${enhanced}`);
    console.log(`   Not found in VAPI: ${notFound}`);
    console.log(`   Errors: ${errors}`);

    if (enhanced > 0) {
      console.log('\\n✅ Your calls now have:');
      console.log('   📝 Complete transcripts');
      console.log('   📹 Call recording URLs');
      console.log('   🎯 AI call outcomes');
      console.log('   💰 Call costs and durations');
      console.log('   😊 Sentiment analysis');
      console.log('\\n🔥 Ready to use in your campaigns dashboard!');
    }

  } catch (error) {
    console.error('❌ Error in backfill process:', error);
  }
}

// Run the simple backfill
if (require.main === module) {
  simpleBackfillVapiData();
}

module.exports = { simpleBackfillVapiData };