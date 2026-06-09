-- 003_auth_hook.sql
-- Custom Access Token Hook: adds tenant_id, role, and location_id to the JWT
-- so RLS helper functions (jwt_tenant_id, jwt_role, jwt_location_id) in 002
-- can read them from app_metadata.
--
-- How it works:
--   Supabase calls this function every time it issues a JWT for an authenticated
--   user. The function looks up admin_users for that user_id and merges the
--   extra claims into app_metadata. If the user is not in admin_users (e.g. a
--   customer accidentally registered via Supabase Auth), the JWT is returned
--   unchanged — the RLS helpers return NULL → no rows exposed.
--
-- Registration (manual step after running this migration):
--   Supabase Dashboard → Authentication → Hooks → Custom Access Token Hook
--   Set: schema=public, function=custom_access_token_hook
--   OR add to supabase/config.toml:
--     [auth.hook.custom_access_token]
--     enabled = true
--     uri = "pg-functions://postgres/public/custom_access_token_hook"

-- ---------------------------------------------------------------------------
-- Function
-- ---------------------------------------------------------------------------

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer                  -- runs as function owner (postgres), bypassing
set search_path = public          -- RLS on admin_users so the lookup always works
as $$
declare
  _user_id     uuid  := (event ->> 'user_id')::uuid;
  _tenant_id   uuid;
  _role        text;
  _location_id uuid;
  _claims      jsonb := event -> 'claims';
begin
  -- Look up the admin profile for this Supabase Auth user.
  select au.tenant_id, au.role::text, au.location_id
  into   _tenant_id, _role, _location_id
  from   public.admin_users au
  where  au.user_id = _user_id;

  -- Only enrich the JWT if the user has an admin_users record.
  if found then
    _claims := jsonb_set(
      _claims,
      '{app_metadata}',
      coalesce(_claims -> 'app_metadata', '{}'::jsonb) || jsonb_build_object(
        'tenant_id',   _tenant_id,
        'role',        _role,
        'location_id', _location_id   -- NULL for owner → serialises as JSON null
      )
    );
  end if;

  return jsonb_set(event, '{claims}', _claims);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- supabase_auth_admin is the role Supabase Auth uses to invoke hooks.
-- ---------------------------------------------------------------------------

grant execute
  on function public.custom_access_token_hook(jsonb)
  to supabase_auth_admin;

-- Revoke from public so only supabase_auth_admin (and superuser) can call it.
revoke execute
  on function public.custom_access_token_hook(jsonb)
  from public;
