-- Lead Qualification Schema for Apex AI Platform
-- This schema supports both preset and custom qualification criteria

-- 1. Add winning_criteria to campaigns table
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS winning_criteria JSONB DEFAULT '{}'::jsonb;

-- 2. Create preset qualification fields table
CREATE TABLE IF NOT EXISTS qualification_field_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL, -- 'appointment', 'interest', 'timeline', 'budget', 'authority', 'pain_point', 'competitor', 'contact_info'
  field_key VARCHAR(100) UNIQUE NOT NULL,
  field_name VARCHAR(200) NOT NULL,
  field_type VARCHAR(50) NOT NULL, -- 'boolean', 'text', 'number', 'date', 'select', 'multi_select'
  description TEXT,
  ai_detection_hints TEXT[], -- Phrases AI should look for
  crm_action VARCHAR(100), -- 'calendar_booking', 'task_creation', 'lead_scoring', 'tag_assignment'
  scoring_weight INTEGER DEFAULT 10, -- How much this affects lead score (0-100)
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  options JSONB, -- For select/multi_select types
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create campaign-specific field configuration
CREATE TABLE IF NOT EXISTS campaign_qualification_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  field_preset_id UUID REFERENCES qualification_field_presets(id),
  is_required BOOLEAN DEFAULT false,
  is_enabled BOOLEAN DEFAULT true,
  custom_weight INTEGER, -- Override default weight for this campaign
  custom_ai_hints TEXT[], -- Additional hints for this campaign
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, field_preset_id)
);

-- 4. Create custom fields for campaigns
CREATE TABLE IF NOT EXISTS campaign_custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  field_key VARCHAR(100) NOT NULL,
  field_name VARCHAR(200) NOT NULL,
  field_type VARCHAR(50) NOT NULL,
  description TEXT,
  ai_detection_hints TEXT[],
  scoring_weight INTEGER DEFAULT 10,
  is_required BOOLEAN DEFAULT false,
  options JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(campaign_id, field_key)
);

-- 5. Store extracted qualification data per lead
CREATE TABLE IF NOT EXISTS lead_qualification_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  call_id UUID REFERENCES calls(id),
  qualification_fields JSONB NOT NULL, -- All extracted field values
  ai_confidence_scores JSONB, -- Confidence per field
  total_score INTEGER, -- Calculated total score
  qualification_status VARCHAR(50), -- 'qualified', 'review', 'disqualified'
  qualification_reasons TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Insert preset qualification fields
INSERT INTO qualification_field_presets (category, field_key, field_name, field_type, description, ai_detection_hints, crm_action, scoring_weight) VALUES
-- Appointment & Follow-up
('appointment', 'appointment_booked', 'Appointment Booked', 'boolean', 'Prospect agreed to a specific meeting time', 
 ARRAY['book a meeting', 'schedule a call', 'set up a time', 'calendar', 'appointment', 'demo on', 'meeting on', 'available on', 'how about', 'does * work for you'], 
 'calendar_booking', 90),

('appointment', 'callback_requested', 'Callback Requested', 'boolean', 'Prospect asked to be called back',
 ARRAY['call me back', 'callback', 'call back', 'reach me at', 'better time', 'try again', 'call me later', 'not a good time'],
 'task_creation', 30),

('appointment', 'demo_requested', 'Demo Requested', 'boolean', 'Prospect specifically asked for a demo',
 ARRAY['show me', 'see a demo', 'demonstration', 'how it works', 'walk me through', 'see it in action', 'trial', 'try it out'],
 'calendar_booking', 80),

-- Interest Level
('interest', 'high_interest_expressed', 'High Interest', 'boolean', 'Strong buying signals detected',
 ARRAY['very interested', 'excited about', 'love to learn', 'definitely need', 'perfect timing', 'exactly what', 'been looking for', 'sign me up'],
 'lead_scoring', 70),

('interest', 'asking_detailed_questions', 'Asking Questions', 'boolean', 'Prospect engaged with specific questions',
 ARRAY['how does', 'what about', 'can you explain', 'tell me more', 'specifically', 'pricing', 'cost', 'implementation', 'features', 'integration'],
 'lead_scoring', 50),

('interest', 'use_case_mentioned', 'Use Case Mentioned', 'text', 'Specific use case or need expressed',
 ARRAY['we need', 'looking for', 'trying to', 'want to', 'goal is', 'help us', 'solve', 'improve', 'automate'],
 'tag_assignment', 60),

-- Timeline
('timeline', 'urgent_need', 'Urgent Need', 'boolean', 'Immediate or urgent timeline mentioned',
 ARRAY['asap', 'urgent', 'immediately', 'right away', 'this week', 'this month', 'quickly', 'fast', 'soon as possible'],
 'lead_scoring', 85),

('timeline', 'timeline_mentioned', 'Timeline Mentioned', 'text', 'Specific timeline for decision/implementation',
 ARRAY['by end of', 'quarter', 'month', 'fiscal year', 'budget cycle', 'planning to', 'timeline', 'timeframe', 'when'],
 'lead_scoring', 40),

-- Budget & Authority
('budget', 'budget_mentioned', 'Budget Mentioned', 'boolean', 'Discussed budget or pricing',
 ARRAY['budget', 'pricing', 'cost', 'afford', 'invest', 'spend', 'price range', 'expensive', 'cheap', 'roi', 'payback'],
 'lead_scoring', 65),

('budget', 'budget_amount', 'Budget Amount', 'text', 'Specific budget range or amount mentioned',
 ARRAY['dollars', 'per month', 'per year', 'annual', 'monthly', 'thousand', 'million', '$', 'k per'],
 'tag_assignment', 75),

('authority', 'decision_maker', 'Decision Maker', 'boolean', 'Speaking with decision maker',
 ARRAY['i decide', 'my decision', 'i approve', 'i can sign', 'owner', 'ceo', 'president', 'director', 'manager', 'head of', 'in charge'],
 'lead_scoring', 70),

('authority', 'influencer', 'Influencer', 'boolean', 'Has influence on decision',
 ARRAY['recommend', 'my boss', 'team decision', 'committee', 'present to', 'make the case', 'influence', 'input'],
 'lead_scoring', 45),

-- Pain Points & Needs
('pain_point', 'current_pain_mentioned', 'Pain Point Mentioned', 'text', 'Specific problem or challenge expressed',
 ARRAY['problem', 'issue', 'challenge', 'struggling', 'difficult', 'frustrated', 'pain', 'annoying', 'waste', 'inefficient', 'manual'],
 'tag_assignment', 55),

('pain_point', 'feature_request', 'Feature Request', 'text', 'Specific features or capabilities requested',
 ARRAY['need it to', 'must have', 'looking for', 'important that', 'require', 'essential', 'critical', 'key feature'],
 'tag_assignment', 50),

-- Competitor Information
('competitor', 'using_competitor', 'Using Competitor', 'boolean', 'Currently using a competitor solution',
 ARRAY['currently using', 'already have', 'switching from', 'looking to replace', 'not happy with', 'comparing', 'alternative'],
 'tag_assignment', 60),

('competitor', 'competitor_name', 'Competitor Name', 'text', 'Specific competitor mentioned',
 ARRAY['salesforce', 'hubspot', 'pipedrive', 'zoho', 'microsoft', 'competitor specific names'],
 'tag_assignment', 40),

-- Contact Information
('contact_info', 'email_provided', 'Email Provided', 'boolean', 'Prospect shared email address',
 ARRAY['email is', 'email me', 'send it to', '@', '.com', 'reach me at'],
 'lead_scoring', 70),

('contact_info', 'best_time_to_call', 'Best Time to Call', 'text', 'Preferred contact time mentioned',
 ARRAY['best time', 'call me', 'morning', 'afternoon', 'evening', 'timezone', 'available', 'reach me'],
 'task_creation', 30),

('contact_info', 'preferred_contact_method', 'Preferred Contact', 'select', 'How they prefer to be contacted',
 ARRAY['prefer email', 'text me', 'call me', 'whatsapp', 'linkedin', 'prefer'],
 'tag_assignment', 25),

-- Company Information
('company', 'company_size_mentioned', 'Company Size', 'text', 'Number of employees or company size',
 ARRAY['employees', 'people', 'team size', 'company size', 'headcount', 'staff', 'users'],
 'lead_scoring', 40),

('company', 'industry_mentioned', 'Industry', 'text', 'Industry or vertical mentioned',
 ARRAY['industry', 'business', 'sector', 'market', 'space', 'vertical'],
 'tag_assignment', 30),

('company', 'growth_mentioned', 'Growth Stage', 'boolean', 'Mentioned growth or scaling',
 ARRAY['growing', 'scaling', 'expanding', 'hiring', 'new market', 'growth', 'increase'],
 'lead_scoring', 50);

-- 7. Create indexes for performance
CREATE INDEX idx_campaign_qual_fields_campaign ON campaign_qualification_fields(campaign_id);
CREATE INDEX idx_campaign_custom_fields_campaign ON campaign_custom_fields(campaign_id);
CREATE INDEX idx_lead_qual_data_lead ON lead_qualification_data(lead_id);
CREATE INDEX idx_lead_qual_data_call ON lead_qualification_data(call_id);
CREATE INDEX idx_qual_presets_category ON qualification_field_presets(category);
CREATE INDEX idx_qual_presets_active ON qualification_field_presets(is_active);

-- 8. Create view for easy access to all campaign fields
CREATE OR REPLACE VIEW campaign_all_qualification_fields AS
SELECT 
  c.id as campaign_id,
  c.name as campaign_name,
  'preset' as field_source,
  qfp.id as field_id,
  qfp.field_key,
  qfp.field_name,
  qfp.field_type,
  qfp.category,
  qfp.description,
  qfp.ai_detection_hints,
  qfp.crm_action,
  COALESCE(cqf.custom_weight, qfp.scoring_weight) as scoring_weight,
  cqf.is_required,
  cqf.is_enabled
FROM campaigns c
LEFT JOIN campaign_qualification_fields cqf ON c.id = cqf.campaign_id
LEFT JOIN qualification_field_presets qfp ON cqf.field_preset_id = qfp.id
WHERE cqf.is_enabled = true

UNION ALL

SELECT 
  c.id as campaign_id,
  c.name as campaign_name,
  'custom' as field_source,
  ccf.id as field_id,
  ccf.field_key,
  ccf.field_name,
  ccf.field_type,
  'custom' as category,
  ccf.description,
  ccf.ai_detection_hints,
  null as crm_action,
  ccf.scoring_weight,
  ccf.is_required,
  true as is_enabled
FROM campaigns c
INNER JOIN campaign_custom_fields ccf ON c.id = ccf.campaign_id;

-- Add comments for documentation
COMMENT ON TABLE qualification_field_presets IS 'Preset qualification fields available for all campaigns';
COMMENT ON TABLE campaign_qualification_fields IS 'Campaign-specific configuration of preset fields';
COMMENT ON TABLE campaign_custom_fields IS 'Custom qualification fields defined per campaign';
COMMENT ON TABLE lead_qualification_data IS 'Extracted qualification data for each lead/call';