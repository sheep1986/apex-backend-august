-- Appointments Schema for Apex AI Platform
-- Simple appointment tracking for qualified leads

-- Create appointments table
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Link to lead/contact
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  
  -- Appointment details
  title VARCHAR(255) NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  location VARCHAR(255), -- 'Phone', 'Zoom', 'In-person', address, etc.
  
  -- Status tracking
  status VARCHAR(50) NOT NULL DEFAULT 'scheduled', -- scheduled, confirmed, completed, cancelled, no_show
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  
  -- Assignment
  assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_email VARCHAR(255),
  assigned_to_name VARCHAR(255),
  
  -- Lead information snapshot (in case lead is deleted)
  lead_name VARCHAR(255),
  lead_email VARCHAR(255),
  lead_phone VARCHAR(50),
  lead_company VARCHAR(255),
  
  -- AI-extracted information
  ai_extracted_datetime TEXT, -- Raw datetime mentioned in call
  ai_confidence_score DECIMAL(3,2), -- How confident AI was about the appointment
  ai_meeting_purpose TEXT, -- What the lead wants to discuss
  ai_special_requests TEXT, -- Any special requests mentioned
  
  -- Notes and outcomes
  internal_notes TEXT,
  meeting_notes TEXT,
  outcome VARCHAR(100), -- 'sale', 'follow_up_needed', 'not_interested', 'no_show', etc.
  next_steps TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  
  -- Source tracking
  source VARCHAR(50) DEFAULT 'ai_call', -- 'ai_call', 'manual', 'web_form', etc.
  qualification_field_id UUID -- Link to which qualification field triggered this
);

-- Create indexes for performance
CREATE INDEX idx_appointments_org_id ON appointments(organization_id);
CREATE INDEX idx_appointments_scheduled_at ON appointments(scheduled_at);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_assigned_to ON appointments(assigned_to_user_id);
CREATE INDEX idx_appointments_lead_id ON appointments(lead_id);
CREATE INDEX idx_appointments_org_scheduled ON appointments(organization_id, scheduled_at);

-- Create appointment reminders table
CREATE TABLE IF NOT EXISTS appointment_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  reminder_type VARCHAR(50) NOT NULL, -- 'email', 'sms', 'task'
  reminder_time TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create view for upcoming appointments
CREATE OR REPLACE VIEW upcoming_appointments AS
SELECT 
  a.*,
  l.first_name || ' ' || l.last_name as lead_full_name,
  c.name as campaign_name,
  u.full_name as assigned_to_full_name
FROM appointments a
LEFT JOIN leads l ON a.lead_id = l.id
LEFT JOIN campaigns c ON a.campaign_id = c.id
LEFT JOIN users u ON a.assigned_to_user_id = u.id
WHERE a.status IN ('scheduled', 'confirmed')
  AND a.scheduled_at > NOW()
ORDER BY a.scheduled_at ASC;

-- Create view for today's appointments
CREATE OR REPLACE VIEW todays_appointments AS
SELECT 
  a.*,
  l.first_name || ' ' || l.last_name as lead_full_name,
  c.name as campaign_name,
  u.full_name as assigned_to_full_name
FROM appointments a
LEFT JOIN leads l ON a.lead_id = l.id
LEFT JOIN campaigns c ON a.campaign_id = c.id
LEFT JOIN users u ON a.assigned_to_user_id = u.id
WHERE a.status IN ('scheduled', 'confirmed')
  AND DATE(a.scheduled_at) = CURRENT_DATE
ORDER BY a.scheduled_at ASC;

-- Function to automatically create appointment from qualified lead
CREATE OR REPLACE FUNCTION create_appointment_from_qualification(
  p_lead_id UUID,
  p_call_id UUID,
  p_campaign_id UUID,
  p_organization_id UUID,
  p_ai_extracted_data JSONB
) RETURNS UUID AS $$
DECLARE
  v_appointment_id UUID;
  v_lead_data RECORD;
BEGIN
  -- Get lead information
  SELECT 
    first_name || ' ' || last_name as full_name,
    email,
    phone,
    company
  INTO v_lead_data
  FROM leads
  WHERE id = p_lead_id;
  
  -- Create appointment
  INSERT INTO appointments (
    organization_id,
    lead_id,
    call_id,
    campaign_id,
    title,
    description,
    scheduled_at,
    lead_name,
    lead_email,
    lead_phone,
    lead_company,
    ai_extracted_datetime,
    ai_confidence_score,
    ai_meeting_purpose,
    source
  ) VALUES (
    p_organization_id,
    p_lead_id,
    p_call_id,
    p_campaign_id,
    'Sales Call with ' || v_lead_data.full_name,
    'Appointment booked via AI call. Please confirm time with lead.',
    COALESCE(
      (p_ai_extracted_data->>'suggested_datetime')::TIMESTAMPTZ,
      NOW() + INTERVAL '2 days' -- Default to 2 days from now if no time extracted
    ),
    v_lead_data.full_name,
    v_lead_data.email,
    v_lead_data.phone,
    v_lead_data.company,
    p_ai_extracted_data->>'datetime_text',
    (p_ai_extracted_data->>'confidence')::DECIMAL,
    p_ai_extracted_data->>'purpose',
    'ai_call'
  ) RETURNING id INTO v_appointment_id;
  
  -- Create reminder
  INSERT INTO appointment_reminders (
    appointment_id,
    reminder_type,
    reminder_time
  ) VALUES (
    v_appointment_id,
    'email',
    (SELECT scheduled_at - INTERVAL '1 hour' FROM appointments WHERE id = v_appointment_id)
  );
  
  RETURN v_appointment_id;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT ALL ON appointments TO authenticated;
GRANT ALL ON appointment_reminders TO authenticated;
GRANT SELECT ON upcoming_appointments TO authenticated;
GRANT SELECT ON todays_appointments TO authenticated;

-- Enable RLS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_reminders ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view appointments in their organization" ON appointments
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create appointments in their organization" ON appointments
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update appointments in their organization" ON appointments
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can view appointment reminders in their organization" ON appointment_reminders
  FOR SELECT USING (
    appointment_id IN (
      SELECT id FROM appointments WHERE organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
      )
    )
  );