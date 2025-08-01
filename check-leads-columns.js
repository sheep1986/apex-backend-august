#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://twigokrtbvigiqnaybfy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMzUyNjksImV4cCI6MjA2NjcxMTI2OX0.AcRI1NYcCYpRqvHZvux15kMbGPocFbvT6uLf5DD6v24';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkLeadsColumns() {
  console.log('🔍 Checking leads table structure...\n');
  
  try {
    // Get a sample lead to see structure
    const { data: lead } = await supabase
      .from('leads')
      .select('*')
      .limit(1)
      .single();
    
    if (lead) {
      console.log('Leads table columns:');
      Object.keys(lead).forEach(key => {
        console.log(`  - ${key}: ${typeof lead[key]} (${lead[key] === null ? 'null' : 'has value'})`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkLeadsColumns();