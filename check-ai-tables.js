const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAITables() {
  console.log('🔍 Checking AI Analysis Database Tables\n');
  
  const tables = [
    { name: 'appointments', required: true },
    { name: 'tasks', required: true },
    { name: 'ai_processing_queue', required: true },
    { name: 'campaign_leads', required: true }
  ];
  
  const missingTables = [];
  
  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table.name)
        .select('*')
        .limit(1);
      
      if (error && error.code === '42P01') {
        console.log(`❌ Table '${table.name}' does not exist`);
        missingTables.push(table.name);
      } else if (error) {
        console.log(`⚠️  Error checking '${table.name}':`, error.message);
      } else {
        console.log(`✅ Table '${table.name}' exists`);
      }
    } catch (err) {
      console.log(`❌ Error checking '${table.name}':`, err.message);
    }
  }
  
  // Check if calls table has AI columns
  console.log('\n🔍 Checking AI columns in calls table...');
  try {
    const { data, error } = await supabase
      .from('calls')
      .select('id, ai_analysis, ai_processed_at, interest_level, appointment_requested')
      .limit(1);
    
    if (error) {
      console.log('⚠️  Some AI columns might be missing:', error.message);
    } else {
      console.log('✅ AI columns exist in calls table');
    }
  } catch (err) {
    console.log('❌ Error checking AI columns:', err.message);
  }
  
  if (missingTables.length > 0) {
    console.log('\n⚠️  Missing tables detected!');
    console.log('\n📝 To create missing tables:');
    console.log('1. Go to Supabase SQL Editor');
    console.log('2. Run the contents of: database/ai-analysis-schema.sql');
    console.log('\nOr run this command if you have direct database access:');
    console.log('psql $DATABASE_URL < database/ai-analysis-schema.sql');
  } else {
    console.log('\n✅ All required tables exist!');
    console.log('\n🚀 Ready to process AI call analysis');
  }
  
  // Show some stats
  console.log('\n📊 Current AI Processing Stats:');
  try {
    const { count: queueCount } = await supabase
      .from('ai_processing_queue')
      .select('*', { count: 'exact', head: true });
    
    const { count: appointmentCount } = await supabase
      .from('appointments')
      .select('*', { count: 'exact', head: true });
    
    const { count: taskCount } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true });
    
    console.log(`   Queue items: ${queueCount || 0}`);
    console.log(`   Appointments: ${appointmentCount || 0}`);
    console.log(`   Tasks: ${taskCount || 0}`);
  } catch (err) {
    console.log('   (Stats not available - tables may need to be created)');
  }
}

checkAITables();