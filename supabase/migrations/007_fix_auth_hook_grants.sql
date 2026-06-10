-- 007_fix_auth_hook_grants.sql
-- Missing USAGE grant that prevents GoTrue from resolving the hook function.
-- Without schema USAGE, supabase_auth_admin cannot see the function even
-- if EXECUTE is granted, so the hook silently never fires.

grant usage on schema public to supabase_auth_admin;
