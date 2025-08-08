-- AI CRM Database Rollback Script
-- This script safely removes all AI CRM tables and modifications
-- WARNING: This will permanently delete all AI CRM data

-- Begin transaction for safety
BEGIN;

-- Drop utility functions first
DROP FUNCTION IF EXISTS check_call_compliance(VARCHAR(20), UUID, UUID);
DROP FUNCTION IF EXISTS get_campaign_metrics(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS get_next_leads_to_call(UUID, INTEGER);

-- Drop AI CRM tables (in reverse dependency order)
DROP TABLE IF EXISTS lead_import_batches CASCADE;
DROP TABLE IF EXISTS compliance_logs CASCADE;
DROP TABLE IF EXISTS campaign_phone_numbers CASCADE;
DROP TABLE IF EXISTS qualified_leads CASCADE;
DROP TABLE IF EXISTS vapi_call_transcripts CASCADE;
DROP TABLE IF EXISTS vapi_call_attempts CASCADE;
DROP TABLE IF EXISTS crm_leads CASCADE;

-- Remove AI CRM columns from existing tables
ALTER TABLE campaigns 
    DROP COLUMN IF EXISTS vapi_assistant_id,
    DROP COLUMN IF EXISTS script_template,
    DROP COLUMN IF EXISTS qualification_criteria,
    DROP COLUMN IF EXISTS target_calls_per_day,
    DROP COLUMN IF EXISTS max_attempts_per_lead,
    DROP COLUMN IF EXISTS days_between_attempts,
    DROP COLUMN IF EXISTS calling_hours,
    DROP COLUMN IF EXISTS timezone_strategy,
    DROP COLUMN IF EXISTS ai_analysis_enabled,
    DROP COLUMN IF EXISTS auto_qualify_threshold;

-- Remove AI CRM columns from contacts table (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contacts') THEN
        ALTER TABLE contacts 
            DROP COLUMN IF EXISTS crm_lead_id,
            DROP COLUMN IF EXISTS lead_source,
            DROP COLUMN IF EXISTS ai_qualification_score,
            DROP COLUMN IF EXISTS last_call_attempt_id,
            DROP COLUMN IF EXISTS total_call_attempts,
            DROP COLUMN IF EXISTS vapi_integration_data;
    END IF;
END $$;

-- Drop AI CRM specific enum types
DROP TYPE IF EXISTS compliance_result;
DROP TYPE IF EXISTS compliance_action;
DROP TYPE IF EXISTS vapi_call_status;
DROP TYPE IF EXISTS ai_qualification_status;

-- Commit the rollback
COMMIT;

-- Rollback completed successfully
SELECT 'AI CRM Rollback completed successfully' AS status;