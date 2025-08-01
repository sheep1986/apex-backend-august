-- Fix assistant and campaign schema issues
-- Add missing total_cost column to campaigns table
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS total_cost DECIMAL(10,4) DEFAULT 0;

-- Create vapi_assistants table if it doesn't exist
CREATE TABLE IF NOT EXISTS vapi_assistants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    vapi_assistant_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'outbound',
    config JSONB,
    voice_id VARCHAR(255),
    first_message TEXT,
    system_prompt TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vapi_assistants_organization 
        FOREIGN KEY (organization_id) 
        REFERENCES organizations(id) 
        ON DELETE CASCADE
);

-- Add unique constraint on vapi_assistant_id
ALTER TABLE vapi_assistants 
ADD CONSTRAINT unique_vapi_assistant_id 
UNIQUE (vapi_assistant_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_vapi_assistants_organization_id 
ON vapi_assistants(organization_id);

CREATE INDEX IF NOT EXISTS idx_vapi_assistants_vapi_id 
ON vapi_assistants(vapi_assistant_id);

-- Update existing campaigns with calculated total_cost
UPDATE campaigns 
SET total_cost = (
    SELECT COALESCE(SUM(cost), 0) 
    FROM calls 
    WHERE calls.campaign_id = campaigns.id
)
WHERE total_cost IS NULL OR total_cost = 0;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_campaigns_assistant_id 
ON campaigns(assistant_id);

CREATE INDEX IF NOT EXISTS idx_campaigns_total_cost 
ON campaigns(total_cost);

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON vapi_assistants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON vapi_assistants TO anon; 