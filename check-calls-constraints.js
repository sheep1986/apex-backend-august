#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://twigokrtbvigiqnaybfy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMzUyNjksImV4cCI6MjA2NjcxMTI2OX0.AcRI1NYcCYpRqvHZvux15kMbGPocFbvT6uLf5DD6v24';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkConstraints() {
  console.log('🔍 Checking calls table constraints...\n');
  
  try {
    // Get table information
    const { data, error } = await supabase
      .rpc('get_table_constraints', {
        table_name: 'calls'
      });
    
    if (error) {
      // Try a simpler query
      const { data: sampleCall } = await supabase
        .from('calls')
        .select('*')
        .limit(1);
      
      if (sampleCall && sampleCall.length > 0) {
        console.log('Sample call structure:');
        console.log(JSON.stringify(sampleCall[0], null, 2));
      }
      
      // Check what values exist
      const { data: statuses } = await supabase
        .from('calls')
        .select('status')
        .limit(10);
      
      console.log('\nExisting status values:');
      const uniqueStatuses = [...new Set(statuses?.map(s => s.status))];
      console.log(uniqueStatuses);
    } else {
      console.log('Table constraints:', data);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkConstraints();