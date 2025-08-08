const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Test endpoint that mirrors exactly what the frontend should be doing
app.post('/test-auth', async (req, res) => {
  try {
    console.log('🧪 Testing auth with frontend configuration...');
    
    // Use the same keys the frontend uses
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMzUyNjksImV4cCI6MjA2NjcxMTI2OX0.AcRI1NYcCYpRqvHZvux15kMbGPocFbvT6uLf5DD6v24'
    );
    
    const { email, password } = req.body;
    
    console.log('📧 Attempting sign in for:', email);
    console.log('🔐 Password length:', password.length);
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      console.error('❌ Auth failed:', error);
      return res.status(400).json({
        success: false,
        error: error.message,
        code: error.status
      });
    }
    
    console.log('✅ Auth successful');
    
    res.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email,
        confirmed: !!data.user.email_confirmed_at
      },
      session: !!data.session
    });
    
  } catch (err) {
    console.error('💥 Test endpoint error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: err.message
    });
  }
});

app.listen(3002, () => {
  console.log('🚀 Auth test server running on http://localhost:3002');
  console.log('📝 Test with: curl -X POST http://localhost:3002/test-auth -H "Content-Type: application/json" -d \'{"email":"seanwentz99@gmail.com","password":"password123"}\'');
});