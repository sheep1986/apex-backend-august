-- AI CRM Database Migration
-- Adds tables required for AI-powered cold calling CRM system
-- This migration extends the existing schema with AI CRM functionality

-- Begin transaction for rollback safety
BEGIN;

-- Create AI CRM specific enum types
CREATE TYPE ai_qualification_status AS ENUM ('qualified', 'disqualified', 'pending', 'callback', 'followup');
CREATE TYPE vapi_call_status AS ENUM ('initiated', 'ringing', 'connected', 'completed', 'failed', 'no_answer', 'busy', 'voicemail');
CREATE TYPE compliance_action AS ENUM ('dnc_check', 'time_check', 'frequency_check', 'consent_check');
CREATE TYPE compliance_result AS ENUM ('allowed', 'blocked', 'pending');

-- 1. Raw leads table for CSV imports
CREATE TABLE IF NOT EXISTS crm_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    phone_number_formatted VARCHAR(25), -- E.164 format
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    company VARCHAR(255),
    email VARCHAR(255),
    timezone VARCHAR(50),
    lead_source VARCHAR(100) DEFAULT 'csv_import',
    custom_fields JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'new', -- new, calling, contacted, qualified, disqualified, dnc
    dnc_status BOOLEAN DEFAULT FALSE,
    priority_score INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    next_call_scheduled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(campaign_id, phone_number)
);

-- 2. Call attempts table (every dial attempt with VAPI)
CREATE TABLE IF NOT EXISTS vapi_call_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES crm_leads(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    vapi_call_id VARCHAR(255) UNIQUE,
    vapi_assistant_id VARCHAR(255),
    phone_number_id VARCHAR(255), -- VAPI phone number ID
    attempt_number INTEGER DEFAULT 1,
    status vapi_call_status DEFAULT 'initiated',
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    cost DECIMAL(10,4),
    answer_rate DECIMAL(5,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Call transcripts and AI analysis storage
CREATE TABLE IF NOT EXISTS vapi_call_transcripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_attempt_id UUID REFERENCES vapi_call_attempts(id) ON DELETE CASCADE,
    vapi_call_id VARCHAR(255),
    transcript TEXT,
    recording_url TEXT,
    recording_duration INTEGER,
    ai_analysis JSONB DEFAULT '{}', -- Full GPT-4 analysis
    qualification_score DECIMAL(5,2),
    interest_level INTEGER CHECK (interest_level >= 1 AND interest_level <= 10),
    sentiment_analysis JSONB DEFAULT '{}',
    extracted_data JSONB DEFAULT '{}', -- budget, timeline, decision maker, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Qualified leads table (CRM entries)
CREATE TABLE IF NOT EXISTS qualified_leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID REFERENCES crm_leads(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    qualification_score DECIMAL(5,2),
    interest_level INTEGER CHECK (interest_level >= 1 AND interest_level <= 10),
    budget_range VARCHAR(100),
    timeline_days INTEGER,
    decision_maker BOOLEAN DEFAULT FALSE,
    pain_points TEXT[],
    next_steps TEXT,
    ai_summary TEXT,
    recommended_action ai_qualification_status DEFAULT 'pending',
    assigned_sales_rep UUID REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'new', -- new, contacted, meeting_scheduled, proposal_sent, won, lost
    follow_up_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Campaign phone numbers management
CREATE TABLE IF NOT EXISTS campaign_phone_numbers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    vapi_phone_number_id VARCHAR(255) UNIQUE,
    phone_number VARCHAR(20) NOT NULL,
    friendly_name VARCHAR(255),
    daily_call_count INTEGER DEFAULT 0,
    total_call_count INTEGER DEFAULT 0,
    monthly_call_count INTEGER DEFAULT 0,
    answer_rate DECIMAL(5,2),
    health_score DECIMAL(5,2),
    status VARCHAR(50) DEFAULT 'active', -- active, resting, flagged, retired
    last_call_at TIMESTAMP WITH TIME ZONE,
    daily_reset_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_DATE + INTERVAL '1 day'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Compliance logging for TCPA
CREATE TABLE IF NOT EXISTS compliance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    phone_number VARCHAR(20) NOT NULL,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    action compliance_action NOT NULL,
    result compliance_result NOT NULL,
    reason VARCHAR(255),
    blocked_until TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Lead import batches tracking
CREATE TABLE IF NOT EXISTS lead_import_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    filename VARCHAR(255),
    total_rows INTEGER,
    valid_rows INTEGER,
    error_rows INTEGER,
    imported_rows INTEGER,
    status VARCHAR(50) DEFAULT 'processing', -- processing, completed, failed
    error_log JSONB DEFAULT '[]',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Add AI CRM specific columns to existing campaigns table
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS 
    vapi_assistant_id VARCHAR(255),
    script_template TEXT,
    qualification_criteria JSONB DEFAULT '{}',
    target_calls_per_day INTEGER DEFAULT 1000,
    max_attempts_per_lead INTEGER DEFAULT 3,
    days_between_attempts INTEGER DEFAULT 3,
    calling_hours JSONB DEFAULT '{"start": 9, "end": 17}',
    timezone_strategy VARCHAR(50) DEFAULT 'local',
    ai_analysis_enabled BOOLEAN DEFAULT TRUE,
    auto_qualify_threshold DECIMAL(5,2) DEFAULT 70.0;

-- Add AI CRM integration columns to existing contacts table (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contacts') THEN
        ALTER TABLE contacts ADD COLUMN IF NOT EXISTS
            crm_lead_id UUID REFERENCES crm_leads(id),
            lead_source VARCHAR(50) DEFAULT 'manual',
            ai_qualification_score DECIMAL(5,2),
            last_call_attempt_id UUID,
            total_call_attempts INTEGER DEFAULT 0,
            vapi_integration_data JSONB DEFAULT '{}';
    END IF;
END $$;

-- Performance indexes for AI CRM tables
CREATE INDEX IF NOT EXISTS idx_crm_leads_campaign_status ON crm_leads(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_leads_phone ON crm_leads(phone_number);
CREATE INDEX IF NOT EXISTS idx_crm_leads_next_call ON crm_leads(next_call_scheduled_at) WHERE next_call_scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crm_leads_account_status ON crm_leads(account_id, status);

CREATE INDEX IF NOT EXISTS idx_vapi_attempts_lead ON vapi_call_attempts(lead_id);
CREATE INDEX IF NOT EXISTS idx_vapi_attempts_campaign_date ON vapi_call_attempts(campaign_id, created_at);
CREATE INDEX IF NOT EXISTS idx_vapi_attempts_vapi_call_id ON vapi_call_attempts(vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_vapi_attempts_status ON vapi_call_attempts(status);

CREATE INDEX IF NOT EXISTS idx_vapi_transcripts_call_attempt ON vapi_call_transcripts(call_attempt_id);
CREATE INDEX IF NOT EXISTS idx_vapi_transcripts_qualification_score ON vapi_call_transcripts(qualification_score DESC);

CREATE INDEX IF NOT EXISTS idx_qualified_leads_score ON qualified_leads(qualification_score DESC);
CREATE INDEX IF NOT EXISTS idx_qualified_leads_campaign ON qualified_leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_qualified_leads_status ON qualified_leads(status);

CREATE INDEX IF NOT EXISTS idx_campaign_numbers_health ON campaign_phone_numbers(campaign_id, health_score);
CREATE INDEX IF NOT EXISTS idx_campaign_numbers_status ON campaign_phone_numbers(status);

CREATE INDEX IF NOT EXISTS idx_compliance_logs_phone ON compliance_logs(phone_number);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_account_action ON compliance_logs(account_id, action);
CREATE INDEX IF NOT EXISTS idx_compliance_logs_result ON compliance_logs(result);

CREATE INDEX IF NOT EXISTS idx_lead_imports_campaign ON lead_import_batches(campaign_id);
CREATE INDEX IF NOT EXISTS idx_lead_imports_status ON lead_import_batches(status);

-- Row Level Security for AI CRM tables
ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE vapi_call_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE vapi_call_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE qualified_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_import_batches ENABLE ROW LEVEL SECURITY;

-- RLS Policies for account-based data isolation
CREATE POLICY "Account isolation for crm_leads" ON crm_leads
    FOR ALL USING (account_id = current_setting('app.current_account_id')::uuid);

CREATE POLICY "Account isolation for vapi_call_attempts" ON vapi_call_attempts
    FOR ALL USING (account_id = current_setting('app.current_account_id')::uuid);

CREATE POLICY "Account isolation for qualified_leads" ON qualified_leads
    FOR ALL USING (account_id = current_setting('app.current_account_id')::uuid);

CREATE POLICY "Account isolation for campaign_phone_numbers" ON campaign_phone_numbers
    FOR ALL USING (account_id = current_setting('app.current_account_id')::uuid);

CREATE POLICY "Account isolation for compliance_logs" ON compliance_logs
    FOR ALL USING (account_id = current_setting('app.current_account_id')::uuid);

CREATE POLICY "Account isolation for lead_import_batches" ON lead_import_batches
    FOR ALL USING (account_id = current_setting('app.current_account_id')::uuid);

-- Triggers for updated_at columns
CREATE TRIGGER update_crm_leads_updated_at BEFORE UPDATE ON crm_leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_qualified_leads_updated_at BEFORE UPDATE ON qualified_leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaign_phone_numbers_updated_at BEFORE UPDATE ON campaign_phone_numbers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Utility functions for AI CRM
CREATE OR REPLACE FUNCTION get_next_leads_to_call(
    p_campaign_id UUID,
    p_limit INTEGER DEFAULT 10
) RETURNS TABLE (
    lead_id UUID,
    phone_number VARCHAR(20),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    attempt_count INTEGER,
    priority_score INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        l.id,
        l.phone_number,
        l.first_name,
        l.last_name,
        COALESCE(
            (SELECT COUNT(*) FROM vapi_call_attempts vca WHERE vca.lead_id = l.id), 
            0
        )::INTEGER as attempt_count,
        l.priority_score
    FROM crm_leads l
    WHERE l.campaign_id = p_campaign_id
    AND l.status IN ('new', 'contacted')
    AND l.dnc_status = FALSE
    AND (
        l.next_call_scheduled_at IS NULL OR 
        l.next_call_scheduled_at <= NOW()
    )
    AND (
        SELECT COUNT(*) FROM vapi_call_attempts vca 
        WHERE vca.lead_id = l.id
    ) < (
        SELECT COALESCE(c.max_attempts_per_lead, 3) 
        FROM campaigns c 
        WHERE c.id = p_campaign_id
    )
    ORDER BY 
        l.priority_score DESC,
        l.created_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate campaign metrics
CREATE OR REPLACE FUNCTION get_campaign_metrics(
    p_campaign_id UUID,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    result JSONB;
    start_date DATE;
    end_date DATE;
BEGIN
    start_date := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '30 days');
    end_date := COALESCE(p_end_date, CURRENT_DATE);
    
    SELECT jsonb_build_object(
        'total_leads', (
            SELECT COUNT(*) FROM crm_leads 
            WHERE campaign_id = p_campaign_id
        ),
        'total_calls', (
            SELECT COUNT(*) FROM vapi_call_attempts 
            WHERE campaign_id = p_campaign_id
            AND DATE(created_at) BETWEEN start_date AND end_date
        ),
        'connected_calls', (
            SELECT COUNT(*) FROM vapi_call_attempts 
            WHERE campaign_id = p_campaign_id
            AND status = 'completed'
            AND DATE(created_at) BETWEEN start_date AND end_date
        ),
        'qualified_leads', (
            SELECT COUNT(*) FROM qualified_leads 
            WHERE campaign_id = p_campaign_id
            AND DATE(created_at) BETWEEN start_date AND end_date
        ),
        'total_cost', (
            SELECT COALESCE(SUM(cost), 0) FROM vapi_call_attempts 
            WHERE campaign_id = p_campaign_id
            AND DATE(created_at) BETWEEN start_date AND end_date
        ),
        'average_qualification_score', (
            SELECT COALESCE(AVG(qualification_score), 0) 
            FROM qualified_leads 
            WHERE campaign_id = p_campaign_id
            AND DATE(created_at) BETWEEN start_date AND end_date
        ),
        'connection_rate', (
            SELECT CASE 
                WHEN COUNT(*) = 0 THEN 0 
                ELSE ROUND(
                    (COUNT(*) FILTER (WHERE status = 'completed')::float / COUNT(*) * 100), 
                    2
                ) 
            END
            FROM vapi_call_attempts 
            WHERE campaign_id = p_campaign_id
            AND DATE(created_at) BETWEEN start_date AND end_date
        ),
        'qualification_rate', (
            SELECT CASE 
                WHEN COUNT(vca.*) = 0 THEN 0 
                ELSE ROUND(
                    (COUNT(ql.*)::float / COUNT(vca.*) * 100), 
                    2
                ) 
            END
            FROM vapi_call_attempts vca
            LEFT JOIN qualified_leads ql ON ql.lead_id = vca.lead_id
            WHERE vca.campaign_id = p_campaign_id
            AND vca.status = 'completed'
            AND DATE(vca.created_at) BETWEEN start_date AND end_date
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to check compliance before making a call
CREATE OR REPLACE FUNCTION check_call_compliance(
    p_phone_number VARCHAR(20),
    p_campaign_id UUID,
    p_account_id UUID
) RETURNS JSONB AS $$
DECLARE
    result JSONB;
    recent_calls INTEGER;
    dnc_blocked BOOLEAN := FALSE;
    time_blocked BOOLEAN := FALSE;
BEGIN
    -- Check recent call frequency
    SELECT COUNT(*) INTO recent_calls
    FROM vapi_call_attempts
    WHERE phone_number_id IN (
        SELECT vapi_phone_number_id FROM campaign_phone_numbers 
        WHERE campaign_id = p_campaign_id
    )
    AND created_at > NOW() - INTERVAL '30 days';
    
    -- Check DNC status
    SELECT EXISTS(
        SELECT 1 FROM compliance_logs 
        WHERE phone_number = p_phone_number
        AND result = 'blocked'
        AND action = 'dnc_check'
        AND (blocked_until IS NULL OR blocked_until > NOW())
    ) INTO dnc_blocked;
    
    -- Check calling hours (simplified - would need timezone logic)
    SELECT EXTRACT(HOUR FROM NOW()) NOT BETWEEN 9 AND 17 INTO time_blocked;
    
    SELECT jsonb_build_object(
        'allowed', NOT (dnc_blocked OR time_blocked OR recent_calls >= 3),
        'reasons', jsonb_build_array(
            CASE WHEN dnc_blocked THEN 'DNC_BLOCKED' END,
            CASE WHEN time_blocked THEN 'OUTSIDE_HOURS' END,
            CASE WHEN recent_calls >= 3 THEN 'FREQUENCY_LIMIT' END
        ) - 'null'::jsonb,
        'recent_calls', recent_calls,
        'next_allowed_time', CASE 
            WHEN time_blocked THEN (CURRENT_DATE + INTERVAL '1 day' + INTERVAL '9 hours')
            ELSE NOW()
        END
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Insert demo data for testing
DO $$
DECLARE
    demo_account_id UUID;
    demo_campaign_id UUID;
    demo_lead_id UUID;
BEGIN
    -- Get demo account ID
    SELECT id INTO demo_account_id FROM accounts WHERE slug = 'demo' LIMIT 1;
    
    IF demo_account_id IS NOT NULL THEN
        -- Create a demo AI CRM campaign
        INSERT INTO campaigns (
            account_id, 
            name, 
            description, 
            type,
            status,
            vapi_assistant_id,
            target_calls_per_day,
            max_attempts_per_lead,
            qualification_criteria
        ) VALUES (
            demo_account_id,
            'Demo AI Cold Calling Campaign',
            'Demo campaign for AI-powered cold calling with lead qualification',
            'outbound',
            'draft',
            'demo-assistant-001',
            100,
            3,
            '{"min_score": 70, "required_fields": ["budget", "timeline"]}'
        ) RETURNING id INTO demo_campaign_id;
        
        -- Create demo leads
        INSERT INTO crm_leads (
            campaign_id, 
            account_id, 
            phone_number, 
            first_name, 
            last_name, 
            company, 
            email,
            status
        ) VALUES 
        (demo_campaign_id, demo_account_id, '+1234567890', 'John', 'Doe', 'Acme Corp', 'john@acme.com', 'new'),
        (demo_campaign_id, demo_account_id, '+1234567891', 'Jane', 'Smith', 'Tech Solutions', 'jane@tech.com', 'new'),
        (demo_campaign_id, demo_account_id, '+1234567892', 'Bob', 'Johnson', 'StartupXYZ', 'bob@startup.com', 'new');
        
        -- Create demo phone number
        INSERT INTO campaign_phone_numbers (
            campaign_id,
            account_id,
            vapi_phone_number_id,
            phone_number,
            friendly_name,
            status
        ) VALUES (
            demo_campaign_id,
            demo_account_id,
            'demo-phone-001',
            '+1555123456',
            'Demo Cold Calling Number',
            'active'
        );
    END IF;
END $$;

-- Commit the transaction
COMMIT;

-- Migration completed successfully
SELECT 'AI CRM Migration completed successfully' AS status;