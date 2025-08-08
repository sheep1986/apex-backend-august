const supabase = require('./services/supabase-client').default;
const fs = require('fs');

async function runMigration() {
  console.log('🔄 Running Campaign Automation migration...');
  
  try {
    // Core table creation commands
    const commands = [
      // 1. Add columns to campaigns table
      `ALTER TABLE campaigns 
       ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft',
       ADD COLUMN IF NOT EXISTS started_at TIMESTAMP DEFAULT NULL,
       ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP DEFAULT NULL,
       ADD COLUMN IF NOT EXISTS scheduled_start TIMESTAMP DEFAULT NULL,
       ADD COLUMN IF NOT EXISTS working_hours JSONB DEFAULT NULL,
       ADD COLUMN IF NOT EXISTS working_days JSONB DEFAULT NULL,
       ADD COLUMN IF NOT EXISTS call_limit_settings JSONB DEFAULT NULL,
       ADD COLUMN IF NOT EXISTS retry_settings JSONB DEFAULT NULL,
       ADD COLUMN IF NOT EXISTS phone_number_ids JSONB DEFAULT NULL`,

      // 2. Create campaign_contacts table
      `CREATE TABLE IF NOT EXISTS campaign_contacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        name VARCHAR(255),
        phone VARCHAR(50) NOT NULL,
        email VARCHAR(255),
        company VARCHAR(255),
        custom_fields JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(campaign_id, phone)
      )`,

      // 3. Create call_queue table
      `CREATE TABLE IF NOT EXISTS call_queue (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        contact_id UUID NOT NULL REFERENCES campaign_contacts(id) ON DELETE CASCADE,
        phone_number VARCHAR(50) NOT NULL,
        contact_name VARCHAR(255) NOT NULL,
        attempt INTEGER DEFAULT 1,
        scheduled_for TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        last_call_id VARCHAR(255),
        last_outcome VARCHAR(50),
        last_attempt_at TIMESTAMP,
        next_retry_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,

      // 4. Create campaign_daily_stats table
      `CREATE TABLE IF NOT EXISTS campaign_daily_stats (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        calls_made INTEGER DEFAULT 0,
        calls_answered INTEGER DEFAULT 0,
        calls_completed INTEGER DEFAULT 0,
        calls_failed INTEGER DEFAULT 0,
        total_duration_seconds INTEGER DEFAULT 0,
        total_cost DECIMAL(10,4) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(campaign_id, date)
      )`,

      // 5. Add columns to calls table
      `ALTER TABLE calls 
       ADD COLUMN IF NOT EXISTS queue_id UUID REFERENCES call_queue(id),
       ADD COLUMN IF NOT EXISTS attempt_number INTEGER DEFAULT 1`
    ];

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      console.log(`🔄 Executing command ${i + 1}/${commands.length}...`);
      
      try {
        const { error } = await supabase.rpc('execute_sql', { query: command });
        
        if (error) {
          console.log(`⚠️ Command ${i + 1} might have failed (could be normal): ${error.message}`);
          errorCount++;
        } else {
          console.log(`✅ Command ${i + 1} executed successfully`);
          successCount++;
        }
      } catch (err) {
        console.log(`⚠️ Command ${i + 1} failed: ${err.message}`);
        errorCount++;
      }
    }

    // Try to verify tables exist
    const { data: tables } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['campaign_contacts', 'call_queue', 'campaign_daily_stats']);

    console.log('\n✅ Migration Summary:');
    console.log(`   Success: ${successCount}`);
    console.log(`   Warnings: ${errorCount}`);
    console.log(`   Tables verified: ${tables?.map(t => t.table_name).join(', ') || 'None'}`);
    
    if (tables && tables.length > 0) {
      console.log('\n🎉 Campaign automation tables are ready!');
    } else {
      console.log('\n⚠️ Some tables may not have been created. Manual setup may be needed.');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

runMigration();