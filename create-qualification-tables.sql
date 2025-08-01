-- Lead Qualification Schema for Apex AI Platform
-- Run this SQL in Supabase SQL Editor

-- 1. Add winning_criteria to campaigns table
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS winning_criteria JSONB DEFAULT '{}'::jsonb;

-- 2. Create preset qualification fields table
CREATE TABLE IF NOT EXISTS qualification_field_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(50) NOT NULL,
  field_key VARCHAR(100) UNIQUE NOT NULL,
  field_name VARCHAR(200) NOT NULL,
  field_type VARCHAR(50) NOT NULL,
  description TEXT,
  ai_detection_hints TEXT[],
  crm_action VARCHAR(100),
  scoring_weight INTEGER DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  options JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create campaign-specific field configuration
CREATE TABLE IF NOT EXISTS campaign_qualification_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  field_preset_id UUID REFERENCES qualification_field_presets(id),
  is_required BOOLEAN DEFAULT false,
  is_enabled BOOLEAN DEFAULT true,
  custom_weight INTEGER,
  custom_ai_hints TEXT[],
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
  qualification_fields JSONB NOT NULL,
  ai_confidence_scores JSONB,
  total_score INTEGER,
  qualification_status VARCHAR(50),
  qualification_reasons TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaign_qual_fields_campaign ON campaign_qualification_fields(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_custom_fields_campaign ON campaign_custom_fields(campaign_id);
CREATE INDEX IF NOT EXISTS idx_lead_qual_data_lead ON lead_qualification_data(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_qual_data_call ON lead_qualification_data(call_id);
CREATE INDEX IF NOT EXISTS idx_qual_presets_category ON qualification_field_presets(category);
CREATE INDEX IF NOT EXISTS idx_qual_presets_active ON qualification_field_presets(is_active);

-- 7. Create view for easy access to all campaign fields
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
COMMENT ON COLUMN campaigns.winning_criteria IS 'AI lead qualification criteria including main criteria, thresholds, requirements, and disqualifiers';