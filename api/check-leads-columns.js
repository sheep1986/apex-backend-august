import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkLeadsColumns() {
  console.log('🔍 Checking leads table columns...\n');
  
  try {
    // Get one lead to see its structure
    const { data: lead, error } = await supabase
      .from('leads')
      .select('*')
      .limit(1)
      .single();
      
    if (error && error.code !== 'PGRST116') {
      console.error('Error:', error);
      return;
    }
    
    if (lead) {
      console.log('Lead columns:');
      Object.keys(lead).forEach(key => {
        console.log(`  - ${key}: ${typeof lead[key]}`);
      });
      
      console.log('\n🔍 Looking for owner-related columns...');
      const ownerColumns = Object.keys(lead).filter(key => 
        key.includes('owner') || key.includes('assigned') || key.includes('created_by')
      );
      
      if (ownerColumns.length > 0) {
        console.log('Found owner-related columns:', ownerColumns);
      } else {
        console.log('❌ No owner_id or similar column found!');
        console.log('Need to add owner_id column to track lead ownership.');
      }
    } else {
      console.log('No leads found in database');
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

checkLeadsColumns();