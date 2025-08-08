-- Stable VAPI Webhook Data Capture System
-- This table is designed to be update-resistant and org-independent
-- Captures ALL VAPI webhook data without complex relationships

-- Create the stable VAPI webhook data table
CREATE TABLE IF NOT EXISTS vapi_webhook_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Core webhook identification
    webhook_type VARCHAR(100) NOT NULL, -- 'call-started', 'call-ended', 'hang', etc.
    webhook_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    webhook_id VARCHAR(255), -- If VAPI provides webhook ID
    
    -- Call identification (simple, no foreign keys)
    vapi_call_id VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50), -- Phone number involved in call
    caller_number VARCHAR(50), -- Caller ID used
    
    -- User identification (email-based, no org dependency)
    user_email VARCHAR(255), -- Email of user who owns this call
    platform_owner_email VARCHAR(255) DEFAULT 'sean@artificialmedia.co.uk',
    
    -- Core call data
    call_status VARCHAR(100), -- 'queued', 'ringing', 'active', 'completed', etc.
    call_direction VARCHAR(20), -- 'inbound', 'outbound'
    call_duration INTEGER DEFAULT 0, -- Duration in seconds
    call_cost DECIMAL(10,4) DEFAULT 0, -- Cost in dollars
    call_started_at TIMESTAMP WITH TIME ZONE,
    call_ended_at TIMESTAMP WITH TIME ZONE,
    end_reason VARCHAR(255), -- Why the call ended
    
    -- AI & Voice data
    transcript TEXT, -- Full call transcript
    summary TEXT, -- AI-generated summary
    recording_url TEXT, -- URL to call recording
    recording_duration INTEGER DEFAULT 0,
    
    -- Assistant & configuration data
    assistant_id VARCHAR(255), -- VAPI assistant ID used
    assistant_name VARCHAR(255), -- Name of assistant
    phone_number_id VARCHAR(255), -- VAPI phone number ID
    
    -- Outcome & disposition
    call_disposition VARCHAR(100), -- Final call outcome
    call_outcome TEXT, -- Detailed outcome description
    sentiment VARCHAR(50), -- 'positive', 'neutral', 'negative'
    
    -- Raw data preservation (MOST IMPORTANT for stability)
    raw_webhook_payload JSONB NOT NULL, -- Complete webhook payload
    raw_call_data JSONB, -- Complete call object from VAPI
    raw_assistant_data JSONB, -- Complete assistant object
    raw_phone_data JSONB, -- Complete phone number object
    
    -- Metadata for debugging and tracking
    processing_status VARCHAR(50) DEFAULT 'processed', -- 'processed', 'error', 'pending'
    processing_notes TEXT, -- Any processing notes or errors
    source_ip VARCHAR(50), -- IP address of webhook sender
    user_agent TEXT, -- User agent of webhook request
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vapi_webhook_call_id ON vapi_webhook_data(vapi_call_id);
CREATE INDEX IF NOT EXISTS idx_vapi_webhook_type ON vapi_webhook_data(webhook_type);
CREATE INDEX IF NOT EXISTS idx_vapi_webhook_timestamp ON vapi_webhook_data(webhook_timestamp);
CREATE INDEX IF NOT EXISTS idx_vapi_webhook_user_email ON vapi_webhook_data(user_email);
CREATE INDEX IF NOT EXISTS idx_vapi_webhook_phone ON vapi_webhook_data(phone_number);
CREATE INDEX IF NOT EXISTS idx_vapi_webhook_status ON vapi_webhook_data(call_status);
CREATE INDEX IF NOT EXISTS idx_vapi_webhook_created ON vapi_webhook_data(created_at);

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_vapi_webhook_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_vapi_webhook_data_updated_at 
    BEFORE UPDATE ON vapi_webhook_data
    FOR EACH ROW EXECUTE FUNCTION update_vapi_webhook_data_updated_at();

-- Helper function to extract call data from raw payload
CREATE OR REPLACE FUNCTION extract_vapi_call_data(payload JSONB)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    result := jsonb_build_object(
        'call_id', payload->'call'->>'id',
        'phone_number', payload->'call'->>'phoneNumber',
        'duration', payload->'call'->'duration',
        'cost', payload->'call'->'cost',
        'status', payload->'call'->>'status',
        'started_at', payload->'call'->>'startedAt',
        'ended_at', payload->'call'->>'endedAt',
        'end_reason', payload->'call'->>'endedReason',
        'transcript', payload->'call'->>'transcript',
        'summary', payload->'call'->>'summary',
        'recording_url', payload->'call'->>'recordingUrl'
    );
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Helper function to get latest webhook data for a call
CREATE OR REPLACE FUNCTION get_latest_call_webhook_data(p_call_id VARCHAR)
RETURNS TABLE (
    webhook_type VARCHAR,
    call_status VARCHAR,
    duration INTEGER,
    cost DECIMAL,
    transcript TEXT,
    summary TEXT,
    recording_url TEXT,
    call_ended_at TIMESTAMP WITH TIME ZONE,
    raw_data JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        vwd.webhook_type,
        vwd.call_status,
        vwd.call_duration,
        vwd.call_cost,
        vwd.transcript,
        vwd.summary,
        vwd.recording_url,
        vwd.call_ended_at,
        vwd.raw_webhook_payload
    FROM vapi_webhook_data vwd
    WHERE vwd.vapi_call_id = p_call_id
    ORDER BY vwd.webhook_timestamp DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Helper function to get call summary by user email
CREATE OR REPLACE FUNCTION get_user_calls_summary(p_user_email VARCHAR)
RETURNS TABLE (
    total_calls BIGINT,
    completed_calls BIGINT,
    total_duration INTEGER,
    total_cost DECIMAL,
    last_call_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT vapi_call_id) as total_calls,
        COUNT(DISTINCT vapi_call_id) FILTER (WHERE call_status = 'completed') as completed_calls,
        COALESCE(SUM(call_duration), 0)::INTEGER as total_duration,
        COALESCE(SUM(call_cost), 0) as total_cost,
        MAX(call_ended_at) as last_call_date
    FROM vapi_webhook_data
    WHERE user_email = p_user_email;
END;
$$ LANGUAGE plpgsql;

-- Simple view for easy data access
CREATE OR REPLACE VIEW vapi_calls_simple AS
SELECT 
    vapi_call_id,
    user_email,
    webhook_type,
    call_status,
    phone_number,
    call_duration,
    call_cost,
    transcript,
    summary,
    recording_url,
    call_started_at,
    call_ended_at,
    webhook_timestamp,
    created_at
FROM vapi_webhook_data
ORDER BY webhook_timestamp DESC;

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL ON vapi_webhook_data TO your_api_user;
-- GRANT ALL ON vapi_calls_simple TO your_api_user;