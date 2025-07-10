-- Leads and Campaigns Schema for Apex AI Calling Platform
-- This schema stores all lead data, campaign information, and call outcomes

-- Campaign Types Enum
CREATE TYPE campaign_type AS ENUM ('b2b', 'b2c');

-- Campaign Status Enum
CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'paused', 'completed', 'cancelled');

-- Lead Status Enum
CREATE TYPE lead_status AS ENUM ('new', 'contacted', 'interested', 'qualified', 'converted', 'unqualified');

-- Call Outcome Enum
CREATE TYPE call_outcome AS ENUM ('interested', 'not_interested', 'callback', 'voicemail', 'no_answer', 'wrong_number', 'do_not_call');

-- Priority Enum
CREATE TYPE priority_level AS ENUM ('low', 'medium', 'high');

-- Campaigns Table
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    campaign_type campaign_type NOT NULL,
    objective TEXT,
    status campaign_status DEFAULT 'draft',
    
    -- Budget and Credits
    daily_budget_limit DECIMAL(10, 2),
    total_budget DECIMAL(10, 2),
    credits_used INTEGER DEFAULT 0,
    auto_reload_enabled BOOLEAN DEFAULT false,
    reload_threshold INTEGER,
    reload_amount DECIMAL(10, 2),
    
    -- Phone Configuration
    phone_numbers TEXT[], -- Array of phone numbers
    vapi_integration_enabled BOOLEAN DEFAULT true,
    
    -- Voice Agent
    voice_agent_id VARCHAR(255),
    voice_agent_name VARCHAR(255),
    voice_agent_config JSONB,
    
    -- Team Assignment
    team_leader_id UUID REFERENCES users(id),
    assigned_team_ids UUID[],
    
    -- Launch Settings
    launch_type VARCHAR(50) DEFAULT 'immediate', -- immediate or scheduled
    scheduled_start_time TIMESTAMP WITH TIME ZONE,
    
    -- Statistics
    total_calls INTEGER DEFAULT 0,
    successful_calls INTEGER DEFAULT 0,
    interested_leads_count INTEGER DEFAULT 0,
    conversion_rate DECIMAL(5, 2) DEFAULT 0,
    average_call_duration INTEGER DEFAULT 0, -- in seconds
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id),
    
    CONSTRAINT check_budget CHECK (total_budget >= 0 AND daily_budget_limit >= 0)
);

-- Leads Table
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    
    -- Basic Information
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50) NOT NULL,
    
    -- B2B Fields
    company VARCHAR(255),
    title VARCHAR(255),
    industry VARCHAR(100),
    company_size VARCHAR(50),
    
    -- B2C Fields
    age_range VARCHAR(50),
    interests TEXT[],
    location VARCHAR(255),
    consent_status BOOLEAN DEFAULT false,
    
    -- Lead Management
    status lead_status DEFAULT 'new',
    priority priority_level DEFAULT 'medium',
    source VARCHAR(100),
    tags TEXT[],
    
    -- Call Information
    last_call_outcome call_outcome,
    interest_level INTEGER CHECK (interest_level >= 1 AND interest_level <= 10),
    call_duration INTEGER, -- in seconds
    pipeline_value DECIMAL(12, 2),
    
    -- Assignment and Follow-up
    assigned_to UUID REFERENCES users(id),
    next_action TEXT,
    next_follow_up TIMESTAMP WITH TIME ZONE,
    
    -- Custom Fields
    custom_fields JSONB DEFAULT '{}',
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_contacted TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT email_or_phone CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- Call Records Table
CREATE TABLE call_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    
    -- Call Details
    call_sid VARCHAR(255), -- VAPI/Twilio call ID
    duration INTEGER, -- in seconds
    outcome call_outcome,
    recording_url TEXT,
    transcript TEXT,
    
    -- AI Analysis
    sentiment_score DECIMAL(3, 2), -- -1 to 1
    key_points TEXT[],
    objections TEXT[],
    buying_signals TEXT[],
    
    -- Cost
    call_cost DECIMAL(10, 4),
    credits_used INTEGER,
    
    -- Agent Info
    agent_id UUID REFERENCES users(id),
    voice_agent_used VARCHAR(255),
    
    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Lead Notes Table
CREATE TABLE lead_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id),
    
    note TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Lead Activities Table (Timeline)
CREATE TABLE lead_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    
    activity_type VARCHAR(50) NOT NULL, -- call, email, note, status_change, assignment
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    
    performed_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Campaign Reports Table
CREATE TABLE campaign_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    
    report_date DATE NOT NULL,
    total_calls INTEGER DEFAULT 0,
    
    -- Outcome Breakdown
    interested_count INTEGER DEFAULT 0,
    not_interested_count INTEGER DEFAULT 0,
    callback_count INTEGER DEFAULT 0,
    voicemail_count INTEGER DEFAULT 0,
    no_answer_count INTEGER DEFAULT 0,
    wrong_number_count INTEGER DEFAULT 0,
    do_not_call_count INTEGER DEFAULT 0,
    
    -- Performance Metrics
    conversion_rate DECIMAL(5, 2),
    average_call_duration INTEGER,
    total_cost DECIMAL(10, 2),
    credits_used INTEGER,
    
    -- Lead Quality
    average_interest_level DECIMAL(3, 1),
    total_pipeline_value DECIMAL(12, 2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(campaign_id, report_date)
);

-- Scheduled Follow-ups Table
CREATE TABLE scheduled_followups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    scheduled_by UUID NOT NULL REFERENCES users(id),
    assigned_to UUID REFERENCES users(id),
    
    scheduled_time TIMESTAMP WITH TIME ZONE NOT NULL,
    notes TEXT,
    reminder_sent BOOLEAN DEFAULT false,
    completed BOOLEAN DEFAULT false,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for Performance
CREATE INDEX idx_campaigns_org_status ON campaigns(organization_id, status);
CREATE INDEX idx_leads_campaign ON leads(campaign_id);
CREATE INDEX idx_leads_assigned ON leads(assigned_to);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_outcome ON leads(last_call_outcome);
CREATE INDEX idx_leads_interest ON leads(interest_level);
CREATE INDEX idx_leads_follow_up ON leads(next_follow_up);
CREATE INDEX idx_call_records_lead ON call_records(lead_id);
CREATE INDEX idx_call_records_campaign ON call_records(campaign_id);
CREATE INDEX idx_activities_lead ON lead_activities(lead_id);
CREATE INDEX idx_followups_scheduled ON scheduled_followups(scheduled_time, completed);

-- Triggers for Updated Timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lead_notes_updated_at BEFORE UPDATE ON lead_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to Update Campaign Statistics
CREATE OR REPLACE FUNCTION update_campaign_statistics(campaign_id_param UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE campaigns c
    SET 
        total_calls = (SELECT COUNT(*) FROM call_records WHERE campaign_id = campaign_id_param),
        successful_calls = (SELECT COUNT(*) FROM call_records WHERE campaign_id = campaign_id_param AND outcome = 'interested'),
        interested_leads_count = (SELECT COUNT(*) FROM leads WHERE campaign_id = campaign_id_param AND last_call_outcome = 'interested'),
        average_call_duration = (SELECT AVG(duration) FROM call_records WHERE campaign_id = campaign_id_param),
        conversion_rate = CASE 
            WHEN (SELECT COUNT(*) FROM call_records WHERE campaign_id = campaign_id_param) > 0
            THEN (SELECT COUNT(*) FROM call_records WHERE campaign_id = campaign_id_param AND outcome = 'interested')::DECIMAL / 
                 (SELECT COUNT(*) FROM call_records WHERE campaign_id = campaign_id_param) * 100
            ELSE 0
        END
    WHERE id = campaign_id_param;
END;
$$ LANGUAGE plpgsql;

-- Sample Data for Testing
-- Insert sample campaign
INSERT INTO campaigns (
    organization_id, 
    name, 
    campaign_type, 
    objective, 
    status,
    daily_budget_limit,
    total_budget,
    voice_agent_name
) VALUES (
    '550e8400-e29b-41d4-a716-446655440000'::UUID,
    'Q4 Enterprise Outreach',
    'b2b',
    'Generate qualified leads for enterprise software solutions',
    'active',
    500.00,
    5000.00,
    'Professional Sales Agent'
);

-- Comments for Documentation
COMMENT ON TABLE campaigns IS 'Stores all AI calling campaigns with configuration and statistics';
COMMENT ON TABLE leads IS 'Stores all leads with support for both B2B and B2C fields';
COMMENT ON TABLE call_records IS 'Detailed record of every call made including AI analysis';
COMMENT ON TABLE lead_activities IS 'Timeline of all activities related to a lead';
COMMENT ON TABLE campaign_reports IS 'Daily aggregated reports for campaign performance';
COMMENT ON TABLE scheduled_followups IS 'Tracks scheduled follow-up calls with reminders'; 