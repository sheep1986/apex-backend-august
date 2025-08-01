-- Create vapi_assistants table
CREATE TABLE IF NOT EXISTS vapi_assistants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  vapi_assistant_id VARCHAR(255) NOT NULL,
  description TEXT,
  model VARCHAR(100),
  voice_id VARCHAR(255),
  first_message TEXT,
  system_prompt TEXT,
  temperature DECIMAL(3,2) DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 1000,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT vapi_assistants_org_vapi_id_unique UNIQUE (organization_id, vapi_assistant_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_vapi_assistants_org_id ON vapi_assistants(organization_id);
CREATE INDEX IF NOT EXISTS idx_vapi_assistants_vapi_id ON vapi_assistants(vapi_assistant_id);

-- Create vapi_phone_numbers table
CREATE TABLE IF NOT EXISTS vapi_phone_numbers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  number VARCHAR(20) NOT NULL,
  vapi_phone_number_id VARCHAR(255) NOT NULL,
  provider VARCHAR(50),
  country_code VARCHAR(5),
  area_code VARCHAR(10),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT vapi_phone_numbers_org_vapi_id_unique UNIQUE (organization_id, vapi_phone_number_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_vapi_phone_numbers_org_id ON vapi_phone_numbers(organization_id);
CREATE INDEX IF NOT EXISTS idx_vapi_phone_numbers_vapi_id ON vapi_phone_numbers(vapi_phone_number_id);

-- Add foreign key constraint from campaigns to vapi_assistants (optional)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'campaigns_assistant_id_fkey' 
    AND table_name = 'campaigns'
  ) THEN
    ALTER TABLE campaigns 
    ADD CONSTRAINT campaigns_assistant_id_fkey 
    FOREIGN KEY (assistant_id) REFERENCES vapi_assistants(id);
  END IF;
END $$;

-- Add foreign key constraint from campaigns to vapi_phone_numbers (optional)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'campaigns_phone_number_id_fkey' 
    AND table_name = 'campaigns'
  ) THEN
    ALTER TABLE campaigns 
    ADD CONSTRAINT campaigns_phone_number_id_fkey 
    FOREIGN KEY (phone_number_id) REFERENCES vapi_phone_numbers(id);
  END IF;
END $$; 