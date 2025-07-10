-- Fix user roles constraint to match the correct roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check 
CHECK (role IN ('platform_owner', 'support_admin', 'support_agent', 'client_admin', 'client_user'));
