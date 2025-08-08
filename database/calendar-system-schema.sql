-- Calendar System Schema for Apex AI Platform
-- Comprehensive appointment, task, and follow-up management

-- ============================================================
-- APPOINTMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  
  -- Appointment Details
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'callback', 'meeting', 'demo', 'consultation', 
    'visit', 'follow_up', 'presentation', 'proposal_review',
    'contract_signing', 'onboarding', 'check_in', 'other'
  )),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Date and Time
  date DATE NOT NULL,
  time TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  timezone VARCHAR(50) DEFAULT 'UTC',
  
  -- Location
  location_type VARCHAR(50) DEFAULT 'phone' CHECK (location_type IN (
    'phone', 'video', 'in_person', 'online'
  )),
  location_details JSONB, -- { address, meeting_link, phone_number, etc }
  
  -- Participants
  attendees JSONB, -- Array of { name, email, role, required }
  organizer_id UUID REFERENCES users(id),
  assigned_to UUID REFERENCES users(id),
  
  -- Status
  status VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'confirmed', 'tentative', 'cancelled', 
    'completed', 'no_show', 'rescheduled'
  )),
  confirmation_status VARCHAR(50) DEFAULT 'pending' CHECK (confirmation_status IN (
    'pending', 'confirmed', 'declined', 'maybe'
  )),
  
  -- Preparation
  agenda TEXT,
  preparation_notes TEXT,
  documents_to_prepare TEXT[],
  talking_points JSONB,
  
  -- Outcome
  outcome VARCHAR(100),
  outcome_notes TEXT,
  next_steps TEXT,
  
  -- Reminders
  reminder_enabled BOOLEAN DEFAULT true,
  reminder_minutes_before INTEGER DEFAULT 15,
  reminder_sent_at TIMESTAMP WITH TIME ZONE,
  
  -- Integration
  external_calendar_id VARCHAR(255), -- Google Calendar, Outlook, etc.
  external_meeting_link VARCHAR(500), -- Zoom, Teams, etc.
  vapi_assistant_id VARCHAR(255), -- For automated calls
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  
  -- Indexes
  INDEX idx_appointments_date (date),
  INDEX idx_appointments_lead (lead_id),
  INDEX idx_appointments_status (status),
  INDEX idx_appointments_assigned (assigned_to),
  INDEX idx_appointments_org_date (organization_id, date)
);

-- ============================================================
-- TASKS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  
  -- Task Details
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) CHECK (category IN (
    'follow_up', 'preparation', 'documentation', 'research',
    'outreach', 'proposal', 'contract', 'other'
  )),
  
  -- Priority and Timing
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN (
    'urgent', 'high', 'medium', 'low'
  )),
  due_date DATE,
  due_time TIME,
  estimated_duration_minutes INTEGER,
  
  -- Assignment
  assigned_to UUID REFERENCES users(id),
  assigned_by UUID REFERENCES users(id),
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'completed', 'cancelled', 
    'deferred', 'blocked', 'delegated'
  )),
  completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID REFERENCES users(id),
  
  -- Details
  checklist JSONB, -- Array of { item, completed, completedAt }
  notes TEXT,
  blockers TEXT,
  
  -- Dependencies
  depends_on UUID REFERENCES tasks(id),
  blocks UUID[] DEFAULT ARRAY[]::UUID[], -- Tasks this blocks
  
  -- Recurrence
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern JSONB, -- { frequency, interval, endDate, etc }
  parent_task_id UUID REFERENCES tasks(id),
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes
  INDEX idx_tasks_due_date (due_date),
  INDEX idx_tasks_assigned (assigned_to),
  INDEX idx_tasks_status (status),
  INDEX idx_tasks_lead (lead_id),
  INDEX idx_tasks_priority_due (priority, due_date)
);

-- ============================================================
-- FOLLOW_UP_SEQUENCES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS follow_up_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Sequence Configuration
  trigger_event VARCHAR(50) CHECK (trigger_event IN (
    'lead_created', 'call_completed', 'appointment_scheduled',
    'proposal_sent', 'no_response', 'custom'
  )),
  
  -- Steps
  steps JSONB NOT NULL, -- Array of sequence steps
  /* Example step structure:
  {
    "stepNumber": 1,
    "delayDays": 1,
    "delayHours": 0,
    "action": "email|call|task|sms",
    "template": "template_id or content",
    "assignTo": "user_id or role",
    "skipWeekends": true,
    "skipConditions": {...}
  }
  */
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id)
);

-- ============================================================
-- FOLLOW_UP_SEQUENCE_ENROLLMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS follow_up_sequence_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES follow_up_sequences(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  
  -- Enrollment Status
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN (
    'active', 'paused', 'completed', 'stopped', 'failed'
  )),
  current_step INTEGER DEFAULT 0,
  
  -- Progress Tracking
  steps_completed JSONB DEFAULT '[]'::JSONB,
  next_step_date TIMESTAMP WITH TIME ZONE,
  
  -- Results
  emails_sent INTEGER DEFAULT 0,
  calls_made INTEGER DEFAULT 0,
  responses_received INTEGER DEFAULT 0,
  
  -- Metadata
  enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  stopped_at TIMESTAMP WITH TIME ZONE,
  stopped_reason TEXT,
  
  -- Indexes
  UNIQUE(sequence_id, lead_id),
  INDEX idx_enrollments_status (status),
  INDEX idx_enrollments_next_step (next_step_date)
);

-- ============================================================
-- CALENDAR_EVENTS TABLE (for general events)
-- ============================================================
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Event Details
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) DEFAULT 'event',
  
  -- Date and Time
  start_date DATE NOT NULL,
  start_time TIME,
  end_date DATE,
  end_time TIME,
  all_day BOOLEAN DEFAULT false,
  timezone VARCHAR(50) DEFAULT 'UTC',
  
  -- Recurrence
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule TEXT, -- RRULE format
  
  -- Visibility
  visibility VARCHAR(20) DEFAULT 'private' CHECK (visibility IN (
    'public', 'private', 'team'
  )),
  
  -- Related Entities
  related_leads UUID[] DEFAULT ARRAY[]::UUID[],
  related_campaigns UUID[] DEFAULT ARRAY[]::UUID[],
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id),
  
  -- Indexes
  INDEX idx_calendar_events_dates (start_date, end_date),
  INDEX idx_calendar_events_org (organization_id)
);

-- ============================================================
-- AVAILABILITY_SCHEDULES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS availability_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Schedule Name
  name VARCHAR(255) DEFAULT 'Default Schedule',
  is_default BOOLEAN DEFAULT false,
  
  -- Weekly Schedule
  weekly_schedule JSONB NOT NULL,
  /* Example structure:
  {
    "monday": { "start": "09:00", "end": "17:00", "breaks": [...] },
    "tuesday": { "start": "09:00", "end": "17:00", "breaks": [...] },
    ...
  }
  */
  
  -- Timezone
  timezone VARCHAR(50) DEFAULT 'UTC',
  
  -- Override Dates
  override_dates JSONB DEFAULT '[]'::JSONB,
  /* Example: [
    { "date": "2024-12-25", "available": false, "reason": "Holiday" },
    { "date": "2024-12-24", "start": "09:00", "end": "12:00" }
  ] */
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes
  UNIQUE(user_id, is_default) WHERE is_default = true
);

-- ============================================================
-- REMINDER_QUEUE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS reminder_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Related Entity
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN (
    'appointment', 'task', 'follow_up'
  )),
  entity_id UUID NOT NULL,
  
  -- Recipient
  recipient_id UUID REFERENCES users(id),
  recipient_email VARCHAR(255),
  recipient_phone VARCHAR(50),
  
  -- Reminder Details
  reminder_type VARCHAR(50) CHECK (reminder_type IN (
    'email', 'sms', 'push', 'in_app'
  )),
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Content
  subject VARCHAR(255),
  message TEXT,
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN (
    'pending', 'sent', 'failed', 'cancelled'
  )),
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes
  INDEX idx_reminder_queue_scheduled (scheduled_for, status),
  INDEX idx_reminder_queue_entity (entity_type, entity_id)
);

-- ============================================================
-- CALENDAR_SYNC_CONFIGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS calendar_sync_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Provider
  provider VARCHAR(50) NOT NULL CHECK (provider IN (
    'google', 'outlook', 'office365', 'apple', 'caldav'
  )),
  
  -- Authentication
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Sync Settings
  sync_direction VARCHAR(20) DEFAULT 'both' CHECK (sync_direction IN (
    'both', 'pull', 'push'
  )),
  sync_appointments BOOLEAN DEFAULT true,
  sync_tasks BOOLEAN DEFAULT false,
  calendar_id VARCHAR(255), -- External calendar ID
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  last_sync_status VARCHAR(50),
  last_error TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Indexes
  UNIQUE(user_id, provider, calendar_id)
);

-- ============================================================
-- VIEWS
-- ============================================================

-- Today's Appointments View
CREATE OR REPLACE VIEW todays_appointments AS
SELECT 
  a.*,
  l.first_name || ' ' || l.last_name as lead_name,
  l.phone as lead_phone,
  l.email as lead_email,
  u.name as assigned_to_name
FROM appointments a
LEFT JOIN leads l ON a.lead_id = l.id
LEFT JOIN users u ON a.assigned_to = u.id
WHERE a.date = CURRENT_DATE
  AND a.status NOT IN ('cancelled', 'completed')
ORDER BY a.time;

-- Upcoming Tasks View
CREATE OR REPLACE VIEW upcoming_tasks AS
SELECT 
  t.*,
  l.first_name || ' ' || l.last_name as lead_name,
  u.name as assigned_to_name
FROM tasks t
LEFT JOIN leads l ON t.lead_id = l.id
LEFT JOIN users u ON t.assigned_to = u.id
WHERE t.status IN ('pending', 'in_progress')
  AND t.due_date <= CURRENT_DATE + INTERVAL '7 days'
ORDER BY t.priority DESC, t.due_date, t.due_time;

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Function to get next available slot
CREATE OR REPLACE FUNCTION get_next_available_slot(
  p_user_id UUID,
  p_duration_minutes INTEGER,
  p_after_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE(available_date DATE, available_time TIME) AS $$
DECLARE
  v_schedule JSONB;
  v_day_name TEXT;
  v_current_date DATE := p_after_date;
  v_max_days INTEGER := 30;
BEGIN
  -- Get user's availability schedule
  SELECT weekly_schedule INTO v_schedule
  FROM availability_schedules
  WHERE user_id = p_user_id AND is_default = true;
  
  -- Loop through next 30 days to find available slot
  FOR i IN 1..v_max_days LOOP
    v_day_name := LOWER(TO_CHAR(v_current_date, 'day'));
    
    -- Check if day has availability
    IF v_schedule->v_day_name IS NOT NULL THEN
      -- Check for existing appointments
      -- Logic to find available slot goes here
      -- This is simplified - real implementation would be more complex
      
      RETURN QUERY
      SELECT v_current_date, '10:00'::TIME;
      RETURN;
    END IF;
    
    v_current_date := v_current_date + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-create follow-up task after appointment
CREATE OR REPLACE FUNCTION create_follow_up_task() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    INSERT INTO tasks (
      organization_id,
      lead_id,
      appointment_id,
      title,
      description,
      category,
      priority,
      due_date,
      assigned_to
    ) VALUES (
      NEW.organization_id,
      NEW.lead_id,
      NEW.id,
      'Follow up on ' || NEW.title,
      'Follow up on appointment outcome and next steps',
      'follow_up',
      'medium',
      NEW.date + INTERVAL '1 day',
      NEW.assigned_to
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER appointment_follow_up_trigger
  AFTER UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION create_follow_up_task();

-- ============================================================
-- INDEXES
-- ============================================================

-- Performance indexes
CREATE INDEX idx_appointments_upcoming ON appointments(date, time) 
  WHERE status NOT IN ('cancelled', 'completed');

CREATE INDEX idx_tasks_overdue ON tasks(due_date) 
  WHERE status = 'pending' AND due_date < CURRENT_DATE;

CREATE INDEX idx_reminders_pending ON reminder_queue(scheduled_for) 
  WHERE status = 'pending';

-- ============================================================
-- INITIAL DATA
-- ============================================================

-- Default follow-up sequence
INSERT INTO follow_up_sequences (organization_id, name, description, trigger_event, steps) 
VALUES (
  (SELECT id FROM organizations LIMIT 1),
  'Standard Sales Follow-Up',
  'Default follow-up sequence for new leads',
  'lead_created',
  '[
    {
      "stepNumber": 1,
      "delayDays": 0,
      "delayHours": 1,
      "action": "email",
      "template": "welcome_email",
      "assignTo": "owner"
    },
    {
      "stepNumber": 2,
      "delayDays": 1,
      "delayHours": 0,
      "action": "call",
      "template": "follow_up_call",
      "assignTo": "owner"
    },
    {
      "stepNumber": 3,
      "delayDays": 3,
      "delayHours": 0,
      "action": "email",
      "template": "value_proposition",
      "assignTo": "owner"
    },
    {
      "stepNumber": 4,
      "delayDays": 7,
      "delayHours": 0,
      "action": "task",
      "template": "check_in_task",
      "assignTo": "owner"
    }
  ]'::JSONB
) ON CONFLICT DO NOTHING;

COMMENT ON TABLE appointments IS 'Stores all appointments, meetings, and scheduled calls';
COMMENT ON TABLE tasks IS 'Task management system for follow-ups and action items';
COMMENT ON TABLE follow_up_sequences IS 'Automated follow-up sequences and cadences';
COMMENT ON TABLE calendar_events IS 'General calendar events and reminders';
COMMENT ON TABLE availability_schedules IS 'User availability for scheduling';