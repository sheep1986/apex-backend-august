import supabase from '../services/supabase-client';
import { EnhancedAIProcessor } from '../services/enhanced-ai-processor';

/**
 * Script to reprocess existing calls with enhanced AI extraction
 * This will extract missing information like addresses, emails, companies, etc.
 */

async function reprocessExistingCalls() {
  console.log('🔄 Starting reprocessing of existing calls with enhanced AI...');
  
  try {
    // Get all calls that have transcripts but might be missing extracted data
    const { data: calls, error } = await supabase
      .from('calls')
      .select('*')
      .not('transcript', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100); // Process last 100 calls
    
    if (error) {
      console.error('❌ Error fetching calls:', error);
      return;
    }
    
    console.log(`📊 Found ${calls?.length || 0} calls to reprocess`);
    
    if (!calls || calls.length === 0) {
      console.log('No calls with transcripts found');
      return;
    }
    
    let processed = 0;
    let updated = 0;
    let failed = 0;
    
    for (const call of calls) {
      try {
        console.log(`\n🔍 Processing call ${call.id}`);
        console.log(`   Customer: ${call.customer_name || 'Unknown'}`);
        console.log(`   Phone: ${call.customer_phone || 'Unknown'}`);
        console.log(`   Current Email: ${call.customer_email || 'None'}`);
        console.log(`   Current Company: ${call.customer_company || 'None'}`);
        console.log(`   Transcript Length: ${call.transcript?.length || 0} chars`);
        
        // Skip if no transcript
        if (!call.transcript || call.transcript.length < 50) {
          console.log('   ⚠️ Skipping - no valid transcript');
          continue;
        }
        
        // Prepare VAPI data structure
        const vapiData = {
          id: call.vapi_call_id || call.id,
          duration: call.duration,
          customer: {
            name: call.customer_name,
            number: call.customer_phone
          },
          summary: call.summary,
          analysis: call.analysis,
          transcript: call.transcript
        };
        
        // Process with enhanced AI
        console.log('   🤖 Running enhanced AI extraction...');
        const extracted = await EnhancedAIProcessor.processCall(
          call.id,
          call.transcript,
          vapiData
        );
        
        if (extracted) {
          console.log('   ✅ Extraction complete:');
          if (extracted.email) console.log(`      Email: ${extracted.email}`);
          if (extracted.company) console.log(`      Company: ${extracted.company}`);
          if (extracted.address) console.log(`      Address: ${extracted.address}`);
          if (extracted.jobTitle) console.log(`      Job Title: ${extracted.jobTitle}`);
          if (extracted.budget) console.log(`      Budget: ${extracted.budget}`);
          if (extracted.timeline) console.log(`      Timeline: ${extracted.timeline}`);
          if (extracted.interestLevel) console.log(`      Interest: ${extracted.interestLevel}/10`);
          
          updated++;
        }
        
        processed++;
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`   ❌ Failed to process call ${call.id}:`, error);
        failed++;
      }
    }
    
    console.log('\n📊 Reprocessing Complete:');
    console.log(`   Total Calls: ${calls.length}`);
    console.log(`   Processed: ${processed}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Failed: ${failed}`);
    
    // Now update any leads that are missing information
    console.log('\n🔄 Updating leads with extracted information...');
    await updateLeadsWithExtractedInfo();
    
  } catch (error) {
    console.error('❌ Fatal error during reprocessing:', error);
  }
}

/**
 * Update leads with information extracted from calls
 */
async function updateLeadsWithExtractedInfo() {
  try {
    // Get leads that are missing key information
    const { data: leads, error } = await supabase
      .from('leads')
      .select('*')
      .or('email.is.null,company.is.null,address.is.null')
      .limit(50);
    
    if (error) {
      console.error('❌ Error fetching leads:', error);
      return;
    }
    
    console.log(`📋 Found ${leads?.length || 0} leads missing information`);
    
    if (!leads || leads.length === 0) {
      return;
    }
    
    for (const lead of leads) {
      // Find the most recent call for this lead
      const { data: calls, error: callError } = await supabase
        .from('calls')
        .select('*')
        .eq('customer_phone', lead.phone)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (callError || !calls || calls.length === 0) {
        continue;
      }
      
      const call = calls[0];
      
      // Check if the call has information we need
      const updates: any = {};
      
      if (!lead.email && call.customer_email) {
        updates.email = call.customer_email;
      }
      
      if (!lead.company && call.customer_company) {
        updates.company = call.customer_company;
      }
      
      if (!lead.address && call.address) {
        updates.address = call.address;
      }
      
      // Extract from qualification details if available
      if (call.qualification_details) {
        const details = typeof call.qualification_details === 'string' 
          ? JSON.parse(call.qualification_details) 
          : call.qualification_details;
        
        if (!lead.job_title && details.jobTitle) {
          updates.job_title = details.jobTitle;
        }
        
        if (!lead.budget && details.budget) {
          updates.budget = details.budget;
        }
        
        if (!lead.timeline && details.timeline) {
          updates.timeline = details.timeline;
        }
      }
      
      // Update lead if we have new information
      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        
        const { error: updateError } = await supabase
          .from('leads')
          .update(updates)
          .eq('id', lead.id);
        
        if (updateError) {
          console.error(`❌ Error updating lead ${lead.id}:`, updateError);
        } else {
          console.log(`✅ Updated lead ${lead.first_name} ${lead.last_name}:`, updates);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error updating leads:', error);
  }
}

// Run the reprocessing
console.log('🚀 Starting Enhanced AI Reprocessing Script');
console.log('📝 This will extract missing information from existing call transcripts');
console.log('⏰ This may take a few minutes depending on the number of calls...\n');

reprocessExistingCalls()
  .then(() => {
    console.log('\n✅ Reprocessing complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });