CREATE INDEX idx_campaign_custom_fields_campaign ON campaign_custom_fields(campaign_id);

CREATE INDEX idx_lead_qual_data_lead ON lead_qualification_data(lead_id);

CREATE INDEX idx_lead_qual_data_call ON lead_qualification_data(call_id);

CREATE INDEX idx_qual_presets_category ON qualification_field_presets(category);

CREATE INDEX idx_qual_presets_active ON qualification_field_presets(is_active);

COMMENT ON TABLE campaign_qualification_fields IS 'Campaign-specific configuration of preset fields';

COMMENT ON TABLE campaign_custom_fields IS 'Custom qualification fields defined per campaign';

COMMENT ON TABLE lead_qualification_data IS 'Extracted qualification data for each lead/call';

