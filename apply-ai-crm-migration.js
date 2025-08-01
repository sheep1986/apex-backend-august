#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/apex_ai',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function applyMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting AI CRM migration...');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'database', 'ai-crm-migration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Apply the migration
    console.log('📊 Applying database migration...');
    await client.query(migrationSQL);
    
    console.log('✅ AI CRM migration completed successfully!');
    
    // Test the migration by running a simple query
    console.log('🔍 Testing migration...');
    const testResult = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM crm_leads) as leads_count,
        (SELECT COUNT(*) FROM vapi_call_attempts) as attempts_count,
        (SELECT COUNT(*) FROM qualified_leads) as qualified_count,
        (SELECT COUNT(*) FROM campaign_phone_numbers) as phone_numbers_count
    `);
    
    console.log('📈 Migration test results:');
    console.log(`  - CRM Leads table: ${testResult.rows[0].leads_count} rows`);
    console.log(`  - Call Attempts table: ${testResult.rows[0].attempts_count} rows`);
    console.log(`  - Qualified Leads table: ${testResult.rows[0].qualified_count} rows`);
    console.log(`  - Phone Numbers table: ${testResult.rows[0].phone_numbers_count} rows`);
    
    // Test utility functions
    console.log('🧪 Testing utility functions...');
    const metricsResult = await client.query(`
      SELECT get_campaign_metrics(
        (SELECT id FROM campaigns WHERE name = 'Demo AI Cold Calling Campaign' LIMIT 1)
      ) as metrics
    `);
    
    if (metricsResult.rows.length > 0) {
      console.log('📊 Demo campaign metrics:', JSON.stringify(metricsResult.rows[0].metrics, null, 2));
    }
    
    console.log('🎉 All tests passed! AI CRM migration is ready for use.');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('💡 To rollback, run: node rollback-ai-crm-migration.js');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
const forceApply = args.includes('--force');

if (!forceApply) {
  console.log('⚠️  This will modify your database schema and add AI CRM tables.');
  console.log('⚠️  Make sure you have a backup before proceeding.');
  console.log('⚠️  Run with --force flag to apply the migration:');
  console.log('   node apply-ai-crm-migration.js --force');
  process.exit(0);
}

// Run the migration
applyMigration().catch(console.error);