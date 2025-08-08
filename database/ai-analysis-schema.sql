-- AI Analysis Schema for Call Processing
-- This adds AI-powered analysis capabilities to the existing system

-- Add AI analysis columns to calls table
ALTER TABLE calls ADD COLUMN IF NOT EXISTS ai_analysis JSONB;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS ai_processed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS extracted_contact JSONB;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS interest_level INTEGER CHECK (interest_level >= 0 AND interest_level <= 100);
ALTER TABLE calls ADD COLUMN IF NOT EXISTS appointment_requested BOOLEAN DEFAULT FALSE;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS callback_requested BOOLEAN DEFAULT FALSE;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS lead_created BOOLEAN DEFAULT FALSE;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS appointment_booked BOOLEAN DEFAULT FALSE;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS callback_scheduled BOOLEAN DEFAULT FALSE;

-- Create appointments table for AI-booked appointments
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  type TEXT NOT NULL DEFAULT 'consultation', -- demo, consultation, follow_up, discovery_call
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, confirmed, completed, cancelled, no_show
  title TEXT,
  description TEXT,
  location TEXT, -- physical address or 'virtual'
  meeting_link TEXT, -- for virtual meetings
  calendar_event_id TEXT, -- external calendar system ID
  assigned_to UUID REFERENCES auth.users(id),
  
  -- Attendee information
  attendee_name TEXT,
  attendee_email TEXT,
  attendee_phone TEXT,
  attendee_company TEXT,
  
  -- Reminder settings
  reminder_sent BOOLEAN DEFAULT FALSE,
  reminder_sent_at TIMESTAMP WITH TIME ZONE,
  
  -- Meeting notes
  notes TEXT,
  outcome TEXT,
  recording_url TEXT,
  
  -- Metadata
  created_by TEXT, -- user_id or 'ai_system'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create tasks table for callbacks and follow-ups
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id),
  type TEXT NOT NULL, -- callback, follow_up, schedule_appointment, review_lead
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMP WITH TIME ZONE,
  priority TEXT DEFAULT 'medium', -- low, medium, high, urgent
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, cancelled
  
  -- Task-specific data
  metadata JSONB DEFAULT '{}',
  
  -- Completion tracking
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID REFERENCES auth.users(id),
  completion_notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create AI processing queue for reliability
CREATE TABLE IF NOT EXISTS ai_processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  priority INTEGER DEFAULT 5, -- 1-10, higher is more urgent
  
  -- Processing details
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  
  -- Results
  processing_started_at TIMESTAMP WITH TIME ZONE,
  processing_completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  result JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add columns to leads table for AI-enhanced data
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_type TEXT DEFAULT 'b2c' CHECK (lead_type IN ('b2b', 'b2c'));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_qualification_score INTEGER CHECK (ai_qualification_score >= 0 AND ai_qualification_score <= 100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_insights JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS preferred_contact_time TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS preferred_contact_method TEXT; -- phone, email, text
ALTER TABLE leads ADD COLUMN IF NOT EXISTS buying_timeline TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_range TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS decision_maker BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS competitors_mentioned TEXT[];

-- Campaign leads junction table for tracking lead progress through campaigns
CREATE TABLE IF NOT EXISTS campaign_leads (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'new', -- new, contacted, interested, qualified, not_interested, converted
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_contact_date TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  PRIMARY KEY (campaign_id, lead_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_calls_ai_processed ON calls(ai_processed_at) WHERE ai_processed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_interest_level ON calls(interest_level) WHERE interest_level IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_calls_appointment_requested ON calls(appointment_requested) WHERE appointment_requested = TRUE;
CREATE INDEX IF NOT EXISTS idx_calls_callback_requested ON calls(callback_requested) WHERE callback_requested = TRUE;

CREATE INDEX IF NOT EXISTS idx_appointments_scheduled ON appointments(scheduled_at, status);
CREATE INDEX IF NOT EXISTS idx_appointments_org ON appointments(organization_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_lead ON appointments(lead_id);

CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date, status) WHERE status != 'completed';
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_lead ON tasks(lead_id);

CREATE INDEX IF NOT EXISTS idx_ai_queue_status ON ai_processing_queue(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_ai_queue_call ON ai_processing_queue(call_id);

-- Row Level Security
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_processing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_leads ENABLE ROW LEVEL SECURITY;

-- RLS Policies for appointments
CREATE POLICY "Users can view appointments in their organization" ON appointments
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Users can create appointments in their organization" ON appointments
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Users can update appointments in their organization" ON appointments
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- RLS Policies for tasks
CREATE POLICY "Users can view tasks in their organization" ON tasks
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Users can manage tasks in their organization" ON tasks
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM team_members 
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Functions for AI processing

-- Function to enqueue a call for AI processing
CREATE OR REPLACE FUNCTION enqueue_call_for_ai_processing(
  p_call_id UUID,
  p_priority INTEGER DEFAULT 5
) RETURNS UUID AS $$
DECLARE
  v_queue_id UUID;
  v_org_id UUID;
BEGIN
  -- Get organization_id from call
  SELECT organization_id INTO v_org_id FROM calls WHERE id = p_call_id;
  
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Call not found: %', p_call_id;
  END IF;
  
  -- Insert into queue
  INSERT INTO ai_processing_queue (call_id, organization_id, priority)
  VALUES (p_call_id, v_org_id, p_priority)
  ON CONFLICT (call_id) DO UPDATE
    SET priority = GREATEST(ai_processing_queue.priority, p_priority),
        status = CASE 
          WHEN ai_processing_queue.status = 'failed' THEN 'pending'
          ELSE ai_processing_queue.status
        END,
        updated_at = NOW()
  RETURNING id INTO v_queue_id;
  
  RETURN v_queue_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically enqueue calls for AI processing
CREATE OR REPLACE FUNCTION trigger_enqueue_for_ai_processing()
RETURNS TRIGGER AS $$
BEGIN
  -- Only enqueue if call has transcript and duration > 30 seconds
  IF NEW.transcript IS NOT NULL AND NEW.duration > 30 THEN
    PERFORM enqueue_call_for_ai_processing(NEW.id, 
      CASE 
        WHEN NEW.duration > 300 THEN 8  -- Long calls get higher priority
        WHEN NEW.duration > 180 THEN 6
        ELSE 5
      END
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on calls table
DROP TRIGGER IF EXISTS auto_enqueue_ai_processing ON calls;
CREATE TRIGGER auto_enqueue_ai_processing
  AFTER INSERT OR UPDATE OF transcript ON calls
  FOR EACH ROW
  WHEN (NEW.transcript IS NOT NULL)
  EXECUTE FUNCTION trigger_enqueue_for_ai_processing();

-- Function to get next call for AI processing
CREATE OR REPLACE FUNCTION get_next_ai_processing_job()
RETURNS TABLE (
  queue_id UUID,
  call_id UUID,
  organization_id UUID
) AS $$
BEGIN
  RETURN QUERY
  UPDATE ai_processing_queue
  SET status = 'processing',
      processing_started_at = NOW(),
      attempts = attempts + 1,
      last_attempt_at = NOW(),
      updated_at = NOW()
  WHERE id = (
    SELECT id FROM ai_processing_queue
    WHERE status = 'pending'
      AND (next_retry_at IS NULL OR next_retry_at <= NOW())
      AND attempts < max_attempts
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id, call_id, organization_id;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL ON appointments TO authenticated;
GRANT ALL ON tasks TO authenticated;
GRANT ALL ON ai_processing_queue TO authenticated;
GRANT ALL ON campaign_leads TO authenticated;

-- Comments
COMMENT ON TABLE appointments IS 'AI-booked appointments from call analysis';
COMMENT ON TABLE tasks IS 'Follow-up tasks including callbacks';
COMMENT ON TABLE ai_processing_queue IS 'Queue for reliable AI processing of calls';
COMMENT ON COLUMN calls.ai_analysis IS 'Complete AI analysis output in JSON format';
COMMENT ON COLUMN calls.interest_level IS 'AI-determined interest level 0-100';
COMMENT ON COLUMN leads.ai_qualification_score IS 'AI-calculated lead quality score';