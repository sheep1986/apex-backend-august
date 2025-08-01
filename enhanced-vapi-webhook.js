// Enhanced VAPI Webhook Handler for Existing Calls Table
// This updates your existing calls table with complete VAPI webhook data

const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Enhanced webhook handler
async function handleVapiWebhook(req, res) {
  try {
    const payload = req.body;
    console.log('📞 VAPI Webhook received:', payload.type, payload.call?.id);

    // Always respond with 200 to prevent VAPI retries
    res.status(200).json({ success: true, message: 'Webhook received' });

    // Process the webhook data
    await processVapiWebhook(payload);

  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(200).json({ success: false, error: error.message });
  }
}

async function processVapiWebhook(payload) {
  const { type, call } = payload;
  
  if (!call?.id) {
    console.log('⚠️ No call ID in webhook payload');
    return;
  }

  const vapiCallId = call.id;
  
  // Find existing call record by vapi_call_id
  const { data: existingCall, error: findError } = await supabase
    .from('calls')
    .select('*')
    .eq('vapi_call_id', vapiCallId)
    .single();

  if (findError && findError.code !== 'PGRST116') {
    console.error('❌ Error finding call:', findError);
    return;
  }

  // Prepare update data based on webhook type
  const updateData = {
    raw_webhook_data: payload,
    vapi_webhook_received_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Extract data based on webhook type
  switch (type) {
    case 'call-started':
      updateData.status = 'in-progress';
      updateData.started_at = call.startedAt || new Date().toISOString();
      break;

    case 'call-ended':
      updateData.status = 'completed';
      updateData.ended_at = call.endedAt || new Date().toISOString();
      updateData.duration = call.duration || 0;
      updateData.cost = call.cost || 0;
      
      // Extract important data from call object
      if (call.transcript) {
        updateData.transcript = call.transcript;
      }
      
      if (call.recording) {
        updateData.recording_url = call.recording.url;
        updateData.recording_duration = call.recording.duration || 0;
      }
      
      if (call.analysis) {
        updateData.outcome = call.analysis.summary || call.analysis.outcome;
        updateData.sentiment = call.analysis.sentiment;
        updateData.summary = call.analysis.summary;
        updateData.key_points = call.analysis.keyPoints;
        updateData.call_quality_score = call.analysis.qualityScore || 0;
      }
      
      // Try to extract outcome from structured data if available
      if (call.messages) {
        const lastMessage = call.messages[call.messages.length - 1];
        if (lastMessage && lastMessage.content) {
          try {
            const structuredData = JSON.parse(lastMessage.content);
            if (structuredData.outcome) {
              updateData.outcome = structuredData.outcome;
            }
          } catch (e) {
            // Not JSON, use as text outcome
            updateData.outcome = lastMessage.content;
          }
        }
      }
      break;

    case 'function-call':
    case 'speech-update':
    case 'transcript':
      // These are real-time updates, just store the raw data
      break;
  }

  // Get user email from call data or metadata
  let userEmail = null;
  if (call.customer?.email) {
    userEmail = call.customer.email;
  } else if (call.metadata?.userEmail) {
    userEmail = call.metadata.userEmail;
  } else if (existingCall?.organization_id) {
    // Try to get user email from organization
    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', existingCall.organization_id)
      .single();
    
    if (org?.name?.includes('test 123')) {
      userEmail = 'info@artificialmedia.co.uk';
    } else if (org?.name?.includes('Artificial Media')) {
      userEmail = 'sean@artificialmedia.co.uk';
    }
  }

  if (existingCall) {
    // Update existing call record
    const { error: updateError } = await supabase
      .from('calls')
      .update(updateData)
      .eq('vapi_call_id', vapiCallId);

    if (updateError) {
      console.error('❌ Error updating call:', updateError);
    } else {
      console.log('✅ Updated call:', vapiCallId, 'with', type, 'data');
      
      // Log what was captured
      if (updateData.recording_url) {
        console.log('  📹 Recording captured:', updateData.recording_url);
      }
      if (updateData.transcript) {
        console.log('  📝 Transcript captured:', updateData.transcript.substring(0, 100) + '...');
      }
      if (updateData.outcome) {
        console.log('  🎯 Outcome captured:', updateData.outcome);
      }
    }
  } else {
    console.log('⚠️ Call not found in database:', vapiCallId);
    console.log('   This might be a call made outside the campaign system');
  }

  // Update campaign statistics if call is completed
  if (type === 'call-ended' && existingCall?.campaign_id) {
    await updateCampaignStats(existingCall.campaign_id);
  }
}

async function updateCampaignStats(campaignId) {
  try {
    // Get all calls for this campaign
    const { data: campaignCalls, error } = await supabase
      .from('calls')
      .select('status, duration, cost, outcome')
      .eq('campaign_id', campaignId);

    if (error) {
      console.error('❌ Error getting campaign calls:', error);
      return;
    }

    // Calculate stats
    const totalCalls = campaignCalls.length;
    const completedCalls = campaignCalls.filter(c => c.status === 'completed').length;
    const totalDuration = campaignCalls.reduce((sum, c) => sum + (c.duration || 0), 0);
    const totalCost = campaignCalls.reduce((sum, c) => sum + (c.cost || 0), 0);
    const successfulCalls = campaignCalls.filter(c => 
      c.outcome && !c.outcome.toLowerCase().includes('failed') && !c.outcome.toLowerCase().includes('no answer')
    ).length;

    // Update campaign record
    const { error: updateError } = await supabase
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

    if (updateError) {
      console.error('❌ Error updating campaign stats:', updateError);
    } else {
      console.log('✅ Updated campaign stats for:', campaignId);
    }
  } catch (error) {
    console.error('❌ Error in updateCampaignStats:', error);
  }
}

module.exports = {
  handleVapiWebhook,
  processVapiWebhook,
  updateCampaignStats
};