import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCallsColumns() {
  console.log('🔍 Checking calls table structure...\n');
  
  try {
    // Get a sample call to see all columns
    const { data: sampleCall, error } = await supabase
      .from('calls')
      .select('*')
      .limit(1)
      .single();
      
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      console.error('Error:', error);
      return;
    }
    
    if (sampleCall) {
      console.log('Available columns in calls table:');
      console.log('=====================================');
      Object.keys(sampleCall).forEach(col => {
        console.log(`- ${col}: ${typeof sampleCall[col]} (${sampleCall[col] === null ? 'null' : 'has value'})`);
      });
    }
    
    // Now check the specific call
    console.log('\n\nChecking call with duration 262...');
    const { data: specificCall, error: callError } = await supabase
      .from('calls')
      .select('*')
      .eq('duration', 262)
      .single();
      
    if (specificCall) {
      console.log('\nFound call:');
      console.log('=====================================');
      console.log(JSON.stringify(specificCall, null, 2));
    } else if (callError) {
      console.log('Error or no call found:', callError);
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

checkCallsColumns();