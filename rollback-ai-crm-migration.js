#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/apex_ai',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function rollbackMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting AI CRM migration rollback...');
    
    // Read the rollback file
    const rollbackPath = path.join(__dirname, 'database', 'ai-crm-rollback.sql');
    const rollbackSQL = fs.readFileSync(rollbackPath, 'utf8');
    
    // Apply the rollback
    console.log('🗑️  Removing AI CRM tables and modifications...');
    await client.query(rollbackSQL);
    
    console.log('✅ AI CRM migration rollback completed successfully!');
    
    // Verify rollback
    console.log('🔍 Verifying rollback...');
    const verifyResult = await client.query(`
      SELECT 
        CASE WHEN EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'crm_leads'
        ) THEN 'EXISTS' ELSE 'REMOVED' END as crm_leads_status,
        CASE WHEN EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'vapi_call_attempts'
        ) THEN 'EXISTS' ELSE 'REMOVED' END as call_attempts_status,
        CASE WHEN EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'qualified_leads'
        ) THEN 'EXISTS' ELSE 'REMOVED' END as qualified_leads_status
    `);
    
    const status = verifyResult.rows[0];
    console.log('📋 Rollback verification:');
    console.log(`  - CRM Leads table: ${status.crm_leads_status}`);
    console.log(`  - Call Attempts table: ${status.call_attempts_status}`);
    console.log(`  - Qualified Leads table: ${status.qualified_leads_status}`);
    
    if (status.crm_leads_status === 'REMOVED' && 
        status.call_attempts_status === 'REMOVED' && 
        status.qualified_leads_status === 'REMOVED') {
      console.log('🎉 Rollback successful! All AI CRM tables have been removed.');
    } else {
      console.log('⚠️  Some tables may still exist. Please check manually.');
    }
    
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    console.error('💡 You may need to manually remove the tables.');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
const forceRollback = args.includes('--force');

if (!forceRollback) {
  console.log('⚠️  This will permanently delete all AI CRM data and tables.');
  console.log('⚠️  This action cannot be undone.');
  console.log('⚠️  Run with --force flag to proceed with rollback:');
  console.log('   node rollback-ai-crm-migration.js --force');
  process.exit(0);
}

// Run the rollback
rollbackMigration().catch(console.error);