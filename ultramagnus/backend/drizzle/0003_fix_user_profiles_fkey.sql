-- Fix user_profiles foreign key to reference auth_users instead of auth.users

-- Drop the old foreign key constraint
ALTER TABLE user_profiles 
DROP CONSTRAINT IF EXISTS user_profiles_id_fkey;

-- Add the correct foreign key constraint pointing to auth_users
ALTER TABLE user_profiles 
ADD CONSTRAINT user_profiles_id_auth_users_fkey 
FOREIGN KEY (id) REFERENCES auth_users(id) ON DELETE CASCADE;
