const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = 3001;

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// Simple auth middleware
const authenticateUser = async (req, res, next) => {
  req.user = {
    id: 'user_2rKQJybW49d6sU79r7Kf3dGJUY3',
    userId: 'user_2rKQJybW49d6sU79r7Kf3dGJUY3',
    organizationId: '2566d8c5-2245-4a3c-b539-4cea21a07d9b'
  };
  next();
};

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Campaigns
app.get('/api/campaigns', authenticateUser, async (req, res) => {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('organization_id', req.user.organizationId);
  
  res.json({ campaigns: data || [] });
});

// VAPI campaigns
app.get('/api/vapi-outbound/campaigns', authenticateUser, async (req, res) => {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('organization_id', req.user.organizationId);
  
  res.json(data || []);
});

// VAPI assistants
app.get('/api/vapi-data/assistants', authenticateUser, async (req, res) => {
  res.json({ 
    assistants: [{
      id: 'b6c626b2-d159-42f3-a8cd-cad8d0f7536c',
      name: 'Sales Assistant'
    }]
  });
});

// VAPI phone numbers
app.get('/api/vapi-data/phone-numbers', authenticateUser, async (req, res) => {
  res.json({ 
    phoneNumbers: [{
      id: 'phone-1',
      number: '+15551234567',
      name: 'Primary Line'
    }]
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});