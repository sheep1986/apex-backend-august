import supabase from '../services/supabase-client';

async function cleanLeadNotes() {
  console.log('🔍 Cleaning duplicate notes from all leads...\n');
  
  try {
    // Get all leads with custom_fields
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, first_name, last_name, phone, custom_fields')
      .not('custom_fields', 'is', null);
    
    if (error) {
      console.error('Error fetching leads:', error);
      return;
    }
    
    console.log(`📊 Found ${leads?.length || 0} leads with custom_fields\n`);
    
    let totalCleaned = 0;
    let totalWithNotes = 0;
    
    for (const lead of leads || []) {
      // Check if custom_fields has notes
      if (lead.custom_fields?.notes) {
        totalWithNotes++;
        const currentNotes = lead.custom_fields.notes;
        
        console.log(`\n📋 Lead: ${lead.first_name} ${lead.last_name || ''}`);
        console.log(`   Phone: ${lead.phone}`);
        console.log(`   Current notes length: ${currentNotes.length} chars`);
        
        // Create a single concise summary
        const cleanSummary = createCleanSummary(lead, currentNotes);
        
        if (cleanSummary.length < currentNotes.length * 0.5) {
          // If we reduced by more than 50%, it was probably duplicated
          console.log(`   ⚠️ Detected duplication - reducing from ${currentNotes.length} to ${cleanSummary.length} chars`);
          
          // Update with clean summary
          const updatedCustomFields = {
            ...lead.custom_fields,
            notes: cleanSummary
          };
          
          const { error: updateError } = await supabase
            .from('leads')
            .update({
              custom_fields: updatedCustomFields,
              updated_at: new Date().toISOString()
            })
            .eq('id', lead.id);
          
          if (!updateError) {
            console.log(`   ✅ Cleaned successfully`);
            totalCleaned++;
          } else {
            console.log(`   ❌ Error updating:`, updateError.message);
          }
        } else {
          console.log(`   ✓ Notes appear clean`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`\n📊 FINAL SUMMARY:`);
    console.log(`   Total leads checked: ${leads?.length || 0}`);
    console.log(`   Leads with notes: ${totalWithNotes}`);
    console.log(`   Leads cleaned: ${totalCleaned}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

function createCleanSummary(lead: any, existingNotes: string): string {
  // Extract key information using regex patterns
  const extractValue = (pattern: RegExp): string => {
    const match = existingNotes.match(pattern);
    return match ? match[1]?.trim() : '';
  };
  
  // Build concise summary
  const parts: string[] = ['📞 CALL SUMMARY'];
  
  // Contact info
  if (lead.first_name || lead.phone) {
    parts.push(`\n👤 CONTACT: ${lead.first_name || ''} ${lead.last_name || ''} | ${lead.phone || ''}`);
  }
  
  // Extract and add address if present
  const addressPatterns = [
    /ADDRESS:.*?([^•\n]+)/i,
    /📍.*?([^•\n]+)/,
    /Address:.*?([^•\n]+)/i
  ];
  
  for (const pattern of addressPatterns) {
    const address = extractValue(pattern);
    if (address && address.length > 5) {
      parts.push(`📍 ADDRESS: ${address}`);
      break;
    }
  }
  
  // Extract interest level
  const interestMatch = existingNotes.match(/Interest Level:.*?(\d+)\/10/i);
  if (interestMatch) {
    parts.push(`\n✅ QUALIFICATION:`);
    parts.push(`• Interest Level: ${interestMatch[1]}/10`);
  }
  
  // Extract appointment
  const appointmentPatterns = [
    /APPOINTMENT:.*?([^•\n]+)/i,
    /📅.*?([^•\n]+)/,
    /Scheduled:.*?([^•\n]+)/i
  ];
  
  for (const pattern of appointmentPatterns) {
    const appointment = extractValue(pattern);
    if (appointment && appointment.length > 5) {
      parts.push(`\n📅 APPOINTMENT: ${appointment}`);
      break;
    }
  }
  
  // Extract calling company
  const companyPatterns = [
    /(?:Company Calling|COMPANY CALLING|Emerald Green Energy|WHO CALLED):.*?([^•\n]+)/i,
    /📌 NOTE:.*?([^•\n]+)/
  ];
  
  for (const pattern of companyPatterns) {
    const company = extractValue(pattern);
    if (company && company.length > 3) {
      // Only add if it's actually a company name, not the prospect's info
      if (!company.includes(lead.first_name) && !company.includes(lead.phone)) {
        parts.push(`\n📌 NOTE: Sales call from ${company}`);
      }
      break;
    }
  }
  
  return parts.join('\n');
}

console.log('🚀 Starting lead notes cleanup\n');
cleanLeadNotes()
  .then(() => {
    console.log('\n✅ Cleanup complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });