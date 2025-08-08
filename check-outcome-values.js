#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://twigokrtbvigiqnaybfy.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.SUPABASE_ANON_KEY || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3aWdva3J0YnZpZ2lxbmF5YmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTExMzUyNjksImV4cCI6MjA2NjcxMTI2OX0.AcRI1NYcCYpRqvHZvux15kMbGPocFbvT6uLf5DD6v24';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkOutcomeValues() {
  console.log('🔍 Checking allowed outcome values...\n');
  
  try {
    // Try inserting a test record to see error message
    const testData = {
      organization_id: '2566d8c5-2245-4a3c-b539-4cea21a07d9b',
      campaign_id: 'd5483845-e373-4917-bb7d-dc3036cc0928',
      status: 'completed',
      outcome: 'test_outcome',
      direction: 'outbound',
      duration: 0
    };
    
    const { error } = await supabase
      .from('calls')
      .insert(testData);
    
    if (error) {
      console.log('Error message:', error.message);
      console.log('\nDetails:', error.details);
      
      // Extract allowed values from error message if possible
      const match = error.details?.match(/\((.*?)\)/);
      if (match) {
        console.log('\nAllowed values might be:', match[1]);
      }
    }
    
    // Also check if we can get the enum values directly
    const { data: enumData, error: enumError } = await supabase
      .rpc('get_enum_values', {
        enum_name: 'call_outcome'
      });
    
    if (!enumError && enumData) {
      console.log('\nEnum values:', enumData);
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkOutcomeValues();