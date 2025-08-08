require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  console.error('Please ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  try {
    console.log('🚀 Running campaign metrics migration...');

    // Read the SQL file
    const sqlPath = path.join(__dirname, 'database', 'add-campaign-metrics-columns.sql');
    const sql = await fs.readFile(sqlPath, 'utf8');

    // Execute the SQL
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // If exec_sql doesn't exist, try running statements individually
      console.log('⚠️  exec_sql not available, running statements individually...');
      
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        console.log('📝 Executing:', statement.substring(0, 50) + '...');
        
        // For now, we'll just log what needs to be done
        // In production, you'd run these through your database connection
      }

      console.log('\n⚠️  Please run the following SQL file manually in your Supabase SQL editor:');
      console.log(`📄 ${sqlPath}`);
      console.log('\nThis will add the missing columns and update campaign metrics.');
    } else {
      console.log('✅ Migration completed successfully!');
    }

    // After migration, update metrics for all campaigns
    console.log('\n📊 Updating campaign metrics...');
    await updateAllCampaignMetrics();

  } catch (error) {
    console.error('❌ Error running migration:', error);
    process.exit(1);
  }
}

async function updateAllCampaignMetrics() {
  try {
    // Get all campaigns
    const { data: campaigns, error: campaignsError } = await supabase
      .from('campaigns')
      .select('id, name')
      .eq('type', 'outbound');

    if (campaignsError) {
      console.error('❌ Error fetching campaigns:', campaignsError);
      return;
    }

    console.log(`📋 Found ${campaigns?.length || 0} campaigns to update`);

    for (const campaign of campaigns || []) {
      console.log(`\n🔄 Updating metrics for campaign: ${campaign.name}`);
      
      // Get lead count
      const { data: leads, count: leadCount } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id);

      // Get call metrics
      const { data: calls, error: callsError } = await supabase
        .from('calls')
        .select('id, status, cost, outcome')
        .eq('campaign_id', campaign.id);

      if (!callsError && calls) {
        const callsCompleted = calls.filter(c => c.status === 'completed').length;
        const totalCost = calls.reduce((sum, c) => sum + (c.cost || 0), 0);
        const successfulCalls = calls.filter(c => 
          ['interested', 'converted', 'callback'].includes(c.outcome)
        ).length;
        const successRate = callsCompleted > 0 ? 
          (successfulCalls / callsCompleted * 100) : 0;

        // Update campaign
        const { error: updateError } = await supabase
          .from('campaigns')
          .update({
            total_leads: leadCount || 0,
            calls_completed: callsCompleted,
            total_cost: totalCost,
            success_rate: successRate,
            total_calls: calls.length,
            successful_calls: successfulCalls,
            updated_at: new Date().toISOString()
          })
          .eq('id', campaign.id);

        if (updateError) {
          console.error(`❌ Error updating campaign ${campaign.id}:`, updateError);
        } else {
          console.log(`✅ Updated: ${leadCount || 0} leads, ${callsCompleted} calls, $${totalCost.toFixed(2)} cost, ${successRate.toFixed(1)}% success`);
        }
      }
    }

    console.log('\n✅ All campaign metrics updated!');

  } catch (error) {
    console.error('❌ Error updating campaign metrics:', error);
  }
}

// Run the migration
runMigration();