-- Add lead qualification workflow fields to calls table
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS qualification_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS ai_recommendation VARCHAR(50),
ADD COLUMN IF NOT EXISTS human_reviewed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS review_notes TEXT,
ADD COLUMN IF NOT EXISTS created_crm_contact BOOLEAN DEFAULT FALSE;

-- Add check constraint for qualification_status
ALTER TABLE calls 
ADD CONSTRAINT calls_qualification_status_check 
CHECK (qualification_status IN ('pending', 'accepted', 'declined', 'auto_accepted', 'auto_declined'));

-- Add check constraint for ai_recommendation
ALTER TABLE calls 
ADD CONSTRAINT calls_ai_recommendation_check 
CHECK (ai_recommendation IN ('accept', 'decline', 'review', NULL));

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_calls_qualification_status ON calls(qualification_status);
CREATE INDEX IF NOT EXISTS idx_calls_organization_pending ON calls(organization_id, qualification_status) 
WHERE qualification_status = 'pending';

-- Add comment to explain the workflow
COMMENT ON COLUMN calls.qualification_status IS 'Lead qualification status: pending (awaiting review), accepted (to CRM), declined (not qualified), auto_accepted (AI high confidence), auto_declined (AI low confidence)';
COMMENT ON COLUMN calls.ai_recommendation IS 'AI recommendation based on confidence score: accept (>80%), decline (<60%), review (60-80%)';
COMMENT ON COLUMN calls.ai_confidence_score IS 'AI confidence score for lead qualification (0.0-1.0)';