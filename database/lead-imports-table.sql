-- Lead Import Tracking Table
CREATE TABLE lead_imports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
    filename VARCHAR(255),
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported_rows INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'partial'
    error_details JSONB DEFAULT '[]',
    warning_details JSONB DEFAULT '[]',
    import_settings JSONB DEFAULT '{}',
    file_size_bytes INTEGER,
    processing_time_ms INTEGER,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lead Import Files Storage Table
CREATE TABLE lead_import_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_id UUID REFERENCES lead_imports(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    storage_path VARCHAR(500) NOT NULL,
    checksum VARCHAR(64),
    is_processed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lead Import Validation Errors Table
CREATE TABLE lead_import_errors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    import_id UUID REFERENCES lead_imports(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    field_name VARCHAR(100),
    error_message TEXT NOT NULL,
    field_value TEXT,
    severity VARCHAR(20) DEFAULT 'error', -- 'error', 'warning', 'info'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Lead Import Templates Table
CREATE TABLE lead_import_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    field_mapping JSONB NOT NULL DEFAULT '{}',
    required_fields TEXT[] DEFAULT '[]',
    optional_fields TEXT[] DEFAULT '[]',
    validation_rules JSONB DEFAULT '{}',
    is_default BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_lead_imports_account_status ON lead_imports(account_id, status);
CREATE INDEX idx_lead_imports_campaign ON lead_imports(campaign_id);
CREATE INDEX idx_lead_imports_created_at ON lead_imports(created_at);
CREATE INDEX idx_lead_import_files_import ON lead_import_files(import_id);
CREATE INDEX idx_lead_import_errors_import ON lead_import_errors(import_id);
CREATE INDEX idx_lead_import_templates_account ON lead_import_templates(account_id);

-- Row Level Security (RLS) Policies
ALTER TABLE lead_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_import_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_import_templates ENABLE ROW LEVEL SECURITY;

-- Lead imports policies
CREATE POLICY "Users can view their account's lead imports" ON lead_imports
    FOR SELECT USING (
        account_id IN (
            SELECT account_id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'
        )
    );

CREATE POLICY "Users can create lead imports for their account" ON lead_imports
    FOR INSERT WITH CHECK (
        account_id IN (
            SELECT account_id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'
        )
    );

CREATE POLICY "Users can update their account's lead imports" ON lead_imports
    FOR UPDATE USING (
        account_id IN (
            SELECT account_id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'
        )
    );

-- Lead import files policies
CREATE POLICY "Users can view their account's import files" ON lead_import_files
    FOR SELECT USING (
        account_id IN (
            SELECT account_id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'
        )
    );

CREATE POLICY "Users can create import files for their account" ON lead_import_files
    FOR INSERT WITH CHECK (
        account_id IN (
            SELECT account_id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'
        )
    );

-- Lead import errors policies
CREATE POLICY "Users can view their account's import errors" ON lead_import_errors
    FOR SELECT USING (
        import_id IN (
            SELECT id FROM lead_imports WHERE account_id IN (
                SELECT account_id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'
            )
        )
    );

-- Lead import templates policies
CREATE POLICY "Users can view their account's import templates" ON lead_import_templates
    FOR SELECT USING (
        account_id IN (
            SELECT account_id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'
        )
    );

CREATE POLICY "Users can create import templates for their account" ON lead_import_templates
    FOR INSERT WITH CHECK (
        account_id IN (
            SELECT account_id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'
        )
    );

CREATE POLICY "Users can update their account's import templates" ON lead_import_templates
    FOR UPDATE USING (
        account_id IN (
            SELECT account_id FROM users WHERE clerk_user_id = auth.jwt() ->> 'sub'
        )
    );

-- Triggers for updated_at
CREATE TRIGGER update_lead_imports_updated_at BEFORE UPDATE ON lead_imports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lead_import_templates_updated_at BEFORE UPDATE ON lead_import_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default template
INSERT INTO lead_import_templates (account_id, name, description, field_mapping, required_fields, optional_fields, is_default) VALUES 
(
    (SELECT id FROM accounts WHERE slug = 'demo'),
    'Standard Lead Import',
    'Default template for importing leads with standard fields',
    '{
        "First Name": "first_name",
        "Last Name": "last_name", 
        "Email": "email",
        "Phone": "phone_number",
        "Company": "company",
        "Title": "title",
        "Status": "status",
        "Priority": "priority",
        "Source": "source",
        "Campaign": "campaign",
        "Tags": "tags",
        "Notes": "notes"
    }',
    ARRAY['First Name', 'Last Name', 'Phone'],
    ARRAY['Email', 'Company', 'Title', 'Status', 'Priority', 'Source', 'Campaign', 'Tags', 'Notes'],
    true
); 