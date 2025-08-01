require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3002;

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString() 
  });
});

// VAPI Webhook handler
app.post('/api/vapi/webhook', async (req, res) => {
  try {
    const payload = req.body;
    const { type, call } = payload;

    console.log('📞 Received VAPI webhook:', { 
      type, 
      callId: call?.id, 
      duration: call?.duration,
      cost: call?.cost 
    });

    if (call?.id && type === 'call-ended') {
      await updateCallFromWebhook(call);
    }

    res.status(200).json({ 
      message: 'Webhook processed successfully',
      type,
      callId: call?.id
    });

  } catch (error) {
    console.error('❌ Error processing VAPI webhook:', error);
    res.status(500).json({ 
      error: 'Failed to process webhook',
      details: error.message
    });
  }
});

// Update call record from webhook data
async function updateCallFromWebhook(call) {
  if (!call?.id) {
    console.log('⚠️ No call ID in webhook data');
    return;
  }

  try {
    const updateData = {
      status: 'completed',
      ended_at: call.endedAt || new Date().toISOString(),
      duration: call.duration || 0,
      cost: call.cost || 0,
      end_reason: call.endedReason,
      transcript: call.transcript,
      summary: call.summary,
      recording_url: call.recordingUrl,
      updated_at: new Date().toISOString()
    };

    console.log('📝 Updating call:', { 
      callId: call.id, 
      updates: Object.keys(updateData),
      cost: updateData.cost
    });

    const { error } = await supabase
      .from('calls')
      .update(updateData)
      .eq('vapi_call_id', call.id);

    if (error) {
      console.error('❌ Error updating call:', error);
    } else {
      console.log('✅ Call updated successfully');
    }
  } catch (error) {
    console.error('❌ Error updating call from webhook:', error);
  }
}

// Export app for serverless
module.exports = app;

// Start server only if not in serverless environment
if (process.env.NETLIFY !== 'true') {
  app.listen(PORT, () => {
    console.log(`🚀 Simple server running on port ${PORT}`);
  });
}