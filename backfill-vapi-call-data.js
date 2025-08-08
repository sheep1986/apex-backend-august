// Backfill existing calls with complete VAPI data
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VAPI_API_KEY = 'da8956d4-0508-474e-bd96-7eda82d2d943'; // Your private key

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
          } else if (res.statusCode === 404) {
            console.log(`⚠️ Call ${callId} not found in VAPI (may have been deleted)`);
            resolve(null);
          } else {
            console.log(`❌ VAPI API error for ${callId}: ${res.statusCode} - ${data}`);
            resolve(null);
          }
        } catch (error) {
          console.error(`❌ Error parsing VAPI response for ${callId}:`, error);
          resolve(null);
        }
      });
    });

    req.on('error', (error) => {
      console.error(`❌ HTTPS request error for ${callId}:`, error);
      resolve(null);
    });

    req.setTimeout(10000, () => {
      console.log(`⏰ Timeout for call ${callId}`);
      req.destroy();
      resolve(null);
    });

    req.end();
  });
}

// Update call record with VAPI data
async function updateCallWithVapiData(callId, vapiData) {
  try {
    const updateData = {
      updated_at: new Date().toISOString(),
      raw_webhook_data: vapiData,
      vapi_webhook_received_at: new Date().toISOString()
    };

    // Extract enhanced data from VAPI response
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

    // Update status based on VAPI data
    if (vapiData.endedAt) {
      updateData.status = 'completed';
      updateData.ended_at = vapiData.endedAt;
    } else if (vapiData.startedAt) {
      updateData.status = 'in-progress';
      updateData.started_at = vapiData.startedAt;
    }

    // Try to extract structured data from messages
    if (vapiData.messages && vapiData.messages.length > 0) {
      const lastMessage = vapiData.messages[vapiData.messages.length - 1];
      if (lastMessage && lastMessage.content && !updateData.outcome) {
        try {
          const structuredData = JSON.parse(lastMessage.content);
          if (structuredData.outcome) {
            updateData.outcome = structuredData.outcome;
            console.log(`  🎯 Structured outcome: ${structuredData.outcome}`);
          }
        } catch (e) {
          // Not JSON, use as text outcome
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
      console.error(`  ❌ Database update error:`, error);
      return false;
    } else {
      console.log(`  ✅ Updated successfully`);
      return true;
    }

  } catch (error) {
    console.error(`❌ Error updating call ${callId}:`, error);
    return false;
  }
}

// Main backfill function
async function backfillVapiData() {
  console.log('🔄 Starting VAPI data backfill process...');
  console.log('🔑 Using VAPI API key:', VAPI_API_KEY.substring(0, 8) + '...');

  try {
    // Get all calls that need enhancement
    const { data: calls, error } = await supabase
      .from('calls')
      .select('vapi_call_id, campaign_id, created_at')
      .not('vapi_call_id', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching calls:', error);
      return;
    }

    console.log(`📊 Found ${calls.length} calls to process\\n`);

    let processed = 0;
    let enhanced = 0;
    let notFound = 0;
    let errors = 0;

    for (const call of calls) {
      processed++;
      console.log(`\\n📞 Processing call ${processed}/${calls.length}: ${call.vapi_call_id}`);
      
      // Skip test calls
      if (call.vapi_call_id.startsWith('test-')) {
        console.log('  ⏩ Skipping test call');
        continue;
      }

      // Fetch data from VAPI
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
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\\n🎉 Backfill process completed!');
    console.log(`📊 Summary:`);
    console.log(`   Total processed: ${processed}`);
    console.log(`   Successfully enhanced: ${enhanced}`);
    console.log(`   Not found in VAPI: ${notFound}`);
    console.log(`   Errors: ${errors}`);

    // Update campaign statistics
    if (enhanced > 0) {
      console.log('\\n🔄 Updating campaign statistics...');
      await updateAllCampaignStats();
    }

  } catch (error) {
    console.error('❌ Error in backfill process:', error);
  }
}

// Update campaign statistics
async function updateAllCampaignStats() {
  try {
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id');

    for (const campaign of campaigns || []) {
      await updateCampaignStats(campaign.id);
    }
    
    console.log('✅ Campaign statistics updated');
  } catch (error) {
    console.error('❌ Error updating campaign stats:', error);
  }
}

async function updateCampaignStats(campaignId) {
  try {
    const { data: campaignCalls } = await supabase
      .from('calls')
      .select('status, duration, cost, outcome')
      .eq('campaign_id', campaignId);

    if (!campaignCalls) return;

    const totalCalls = campaignCalls.length;
    const completedCalls = campaignCalls.filter(c => c.status === 'completed').length;
    const totalDuration = campaignCalls.reduce((sum, c) => sum + (c.duration || 0), 0);
    const totalCost = campaignCalls.reduce((sum, c) => sum + (c.cost || 0), 0);
    const successfulCalls = campaignCalls.filter(c => 
      c.outcome && !c.outcome.toLowerCase().includes('failed') && !c.outcome.toLowerCase().includes('no answer')
    ).length;

    await supabase
      .from('campaigns')
      .update({
        total_calls: totalCalls,
        calls_completed: completedCalls,
        successful_calls: successfulCalls,
        total_duration: totalDuration,
        total_cost: totalCost,
        conversion_rate: totalCalls > 0 ? (successfulCalls / totalCalls) * 100 : 0,
        avg_call_duration: totalCalls > 0 ? totalDuration / totalCalls : 0,
        cost_per_call: totalCalls > 0 ? totalCost / totalCalls : 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId);

  } catch (error) {
    console.error(`Error updating campaign ${campaignId}:`, error);
  }
}

// Run the backfill
if (require.main === module) {
  backfillVapiData();
}

module.exports = { backfillVapiData, fetchVapiCallData, updateCallWithVapiData };