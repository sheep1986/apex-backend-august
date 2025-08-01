-- Subscription and Billing Schema for Apex AI Platform

-- Subscription Plans
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  price_monthly DECIMAL(10,2) NOT NULL,
  price_yearly DECIMAL(10,2),
  stripe_price_id_monthly VARCHAR(255),
  stripe_price_id_yearly VARCHAR(255),
  
  -- Limits and Features
  max_calls_per_month INTEGER NOT NULL,
  max_users INTEGER NOT NULL,
  max_campaigns INTEGER NOT NULL,
  max_ai_assistants INTEGER NOT NULL,
  max_phone_numbers INTEGER NOT NULL,
  
  -- Feature Flags
  features JSONB DEFAULT '{
    "basic_calling": true,
    "ai_intelligence": false,
    "ab_testing": false,
    "campaign_dna": false,
    "advanced_analytics": false,
    "white_label": false,
    "api_access": false,
    "priority_support": false,
    "custom_integrations": false,
    "dedicated_account_manager": false
  }',
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Subscriptions
CREATE TABLE user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES subscription_plans(id),
  
  -- Stripe Data
  stripe_customer_id VARCHAR(255) UNIQUE,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  stripe_payment_method_id VARCHAR(255),
  
  -- Subscription Details
  status VARCHAR(50) DEFAULT 'trialing', -- trialing, active, past_due, canceled, incomplete
  billing_cycle VARCHAR(20) DEFAULT 'monthly', -- monthly, yearly
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  trial_end TIMESTAMP WITH TIME ZONE,
  cancel_at TIMESTAMP WITH TIME ZONE,
  canceled_at TIMESTAMP WITH TIME ZONE,
  
  -- Usage Tracking
  current_month_calls INTEGER DEFAULT 0,
  current_month_cost DECIMAL(10,2) DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Usage Records for Billing
CREATE TABLE usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE CASCADE,
  
  -- Usage Details
  resource_type VARCHAR(50) NOT NULL, -- 'calls', 'sms', 'ai_minutes', 'storage'
  quantity INTEGER NOT NULL,
  unit_cost DECIMAL(10,4),
  total_cost DECIMAL(10,2),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  billing_period VARCHAR(7), -- YYYY-MM format
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Billing History
CREATE TABLE billing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE CASCADE,
  
  -- Invoice Details
  stripe_invoice_id VARCHAR(255) UNIQUE,
  invoice_number VARCHAR(50),
  amount_total DECIMAL(10,2) NOT NULL,
  amount_paid DECIMAL(10,2),
  amount_due DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'USD',
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft', -- draft, open, paid, void, uncollectible
  payment_status VARCHAR(50), -- pending, succeeded, failed
  
  -- Dates
  period_start TIMESTAMP WITH TIME ZONE,
  period_end TIMESTAMP WITH TIME ZONE,
  due_date TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  
  -- URLs
  invoice_pdf_url TEXT,
  hosted_invoice_url TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert Default Subscription Plans
INSERT INTO subscription_plans (name, display_name, description, price_monthly, price_yearly, max_calls_per_month, max_users, max_campaigns, max_ai_assistants, max_phone_numbers, features, sort_order) VALUES
-- Starter Plan
('starter', 'Starter', 'Perfect for small businesses getting started with AI calling', 299, 2990, 5000, 3, 2, 1, 1, 
'{
  "basic_calling": true,
  "ai_intelligence": false,
  "ab_testing": false,
  "campaign_dna": false,
  "advanced_analytics": false,
  "white_label": false,
  "api_access": false,
  "priority_support": false,
  "custom_integrations": false,
  "dedicated_account_manager": false
}', 1),

-- Professional Plan
('professional', 'Professional', 'For growing teams that need advanced features', 799, 7990, 20000, 10, 10, 5, 5,
'{
  "basic_calling": true,
  "ai_intelligence": true,
  "ab_testing": true,
  "campaign_dna": false,
  "advanced_analytics": true,
  "white_label": false,
  "api_access": true,
  "priority_support": false,
  "custom_integrations": false,
  "dedicated_account_manager": false
}', 2),

-- Enterprise Plan
('enterprise', 'Enterprise', 'Full platform access with white-label options', 2499, 24990, 100000, 50, -1, -1, -1,
'{
  "basic_calling": true,
  "ai_intelligence": true,
  "ab_testing": true,
  "campaign_dna": true,
  "advanced_analytics": true,
  "white_label": true,
  "api_access": true,
  "priority_support": true,
  "custom_integrations": true,
  "dedicated_account_manager": true
}', 3),

-- Custom Plan
('custom', 'Custom', 'Tailored solutions for your specific needs', 0, 0, -1, -1, -1, -1, -1,
'{
  "basic_calling": true,
  "ai_intelligence": true,
  "ab_testing": true,
  "campaign_dna": true,
  "advanced_analytics": true,
  "white_label": true,
  "api_access": true,
  "priority_support": true,
  "custom_integrations": true,
  "dedicated_account_manager": true
}', 4);

-- Create indexes for performance
CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_org_id ON user_subscriptions(organization_id);
CREATE INDEX idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX idx_user_subscriptions_stripe_customer ON user_subscriptions(stripe_customer_id);
CREATE INDEX idx_usage_records_org_period ON usage_records(organization_id, billing_period);
CREATE INDEX idx_billing_history_org_id ON billing_history(organization_id);
CREATE INDEX idx_billing_history_status ON billing_history(status);

-- Function to check if user has feature access
CREATE OR REPLACE FUNCTION has_feature_access(
  p_user_id UUID,
  p_feature_name TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_has_access BOOLEAN;
BEGIN
  SELECT 
    COALESCE(
      (sp.features->p_feature_name)::boolean, 
      false
    ) INTO v_has_access
  FROM users u
  JOIN user_subscriptions us ON u.id = us.user_id
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE u.id = p_user_id
  AND us.status IN ('active', 'trialing')
  LIMIT 1;
  
  RETURN COALESCE(v_has_access, false);
END;
$$ LANGUAGE plpgsql;

-- Function to check usage limits
CREATE OR REPLACE FUNCTION check_usage_limit(
  p_organization_id UUID,
  p_resource_type TEXT
) RETURNS TABLE(
  is_within_limit BOOLEAN,
  current_usage INTEGER,
  limit_amount INTEGER,
  percentage_used DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN sp.max_calls_per_month = -1 THEN true
      ELSE us.current_month_calls < sp.max_calls_per_month
    END as is_within_limit,
    us.current_month_calls as current_usage,
    sp.max_calls_per_month as limit_amount,
    CASE 
      WHEN sp.max_calls_per_month = -1 THEN 0
      ELSE ROUND((us.current_month_calls::decimal / sp.max_calls_per_month) * 100, 2)
    END as percentage_used
  FROM organizations o
  JOIN user_subscriptions us ON o.id = us.organization_id
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE o.id = p_organization_id
  AND us.status IN ('active', 'trialing')
  LIMIT 1;
END;
$$ LANGUAGE plpgsql; 