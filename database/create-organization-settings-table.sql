-- Create organization_settings table for storing organization-specific settings
-- This table allows flexible key-value storage for organization settings

CREATE TABLE IF NOT EXISTS organization_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    setting_key VARCHAR(255) NOT NULL,
    setting_value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure unique key per organization
    UNIQUE(organization_id, setting_key),
    
    -- Indexes for performance
    INDEX idx_organization_settings_org_id (organization_id),
    INDEX idx_organization_settings_key (setting_key),
    INDEX idx_organization_settings_org_key (organization_id, setting_key)
);

-- Create trigger to update updated_at column
CREATE OR REPLACE FUNCTION update_organization_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organization_settings_updated_at
    BEFORE UPDATE ON organization_settings
    FOR EACH ROW EXECUTE FUNCTION update_organization_settings_updated_at();

-- Add comments for documentation
COMMENT ON TABLE organization_settings IS 'Flexible key-value storage for organization-specific settings';
COMMENT ON COLUMN organization_settings.setting_key IS 'Setting identifier (e.g., "vapi_credentials", "billing_config")';
COMMENT ON COLUMN organization_settings.setting_value IS 'JSON value containing the setting data'; 