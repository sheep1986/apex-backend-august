-- Fix user roles constraint to include all valid roles
DO $$ 
BEGIN
    -- Drop existing constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage 
        WHERE constraint_name = 'users_role_check'
    ) THEN
        ALTER TABLE users DROP CONSTRAINT users_role_check;
    END IF;
    
    -- Add correct constraint with all valid roles used in the application
    ALTER TABLE users ADD CONSTRAINT users_role_check 
    CHECK (role IN (
        'platform_owner', 
        'agency_admin', 
        'agency_user', 
        'client_admin', 
        'client_user', 
        'agent', 
        'admin', 
        'user',
        'support_admin',
        'support_agent'
    ));
    
    RAISE NOTICE '✅ User roles constraint has been updated successfully!';
    RAISE NOTICE '✅ Valid roles: platform_owner, agency_admin, agency_user, client_admin, client_user, agent, admin, user, support_admin, support_agent';
END $$; 