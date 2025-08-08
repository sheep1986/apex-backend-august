import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deleteOrphanLeads() {
  console.log('🗑️  Deleting orphan/test leads...\n');
  
  try {
    // First, let's see what we're about to delete
    const { data: orphanLeads, error: fetchError } = await supabase
      .from('leads')
      .select('id, first_name, last_name, phone')
      .is('campaign_id', null)
      .is('uploaded_by', null);
      
    if (fetchError) {
      console.error('Error fetching orphan leads:', fetchError);
      return;
    }
    
    console.log(`Found ${orphanLeads.length} orphan leads to delete:`);
    orphanLeads.forEach(lead => {
      console.log(`  - ${lead.first_name || 'Unknown'} ${lead.last_name || ''} (${lead.phone})`);
    });
    
    if (orphanLeads.length === 0) {
      console.log('\nNo orphan leads to delete!');
      return;
    }
    
    console.log('\nDeleting...');
    
    // Delete orphan leads (no campaign and no owner)
    const { error: deleteError } = await supabase
      .from('leads')
      .delete()
      .is('campaign_id', null)
      .is('uploaded_by', null);
      
    if (deleteError) {
      console.error('❌ Error deleting leads:', deleteError);
    } else {
      console.log(`✅ Successfully deleted ${orphanLeads.length} orphan/test leads!`);
      console.log('\nYour CRM now contains only real campaign leads with proper ownership.');
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

// Add confirmation
console.log('⚠️  This will permanently delete all leads without campaigns or owners.');
console.log('These appear to be test/mock data.');
console.log('\nPress Ctrl+C to cancel, or wait 3 seconds to continue...\n');

setTimeout(() => {
  deleteOrphanLeads();
}, 3000);