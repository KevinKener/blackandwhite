-- E2E seed: creates the admin user referenced by ADMIN_EMAIL / ADMIN_PASSWORD.
-- Run after supabase db reset. The auth hook injects tenant_id/role/location_id
-- into the JWT on first sign-in, which is what the E2E tests use.

do $$
declare
  _tenant_id  uuid;
  _location_id uuid;
  _user_id    uuid;
begin
  -- Tenant
  insert into public.tenants (name)
  values ('Black & White E2E')
  returning id into _tenant_id;

  -- Location
  insert into public.locations (tenant_id, name, address)
  values (_tenant_id, 'Local Centro', 'Av. Corrientes 1234')
  returning id into _location_id;

  -- Auth user (password set via Supabase admin API in CI, not here)
  -- This seed only creates the admin_users record; the auth user must
  -- already exist (created by the E2E workflow step that sets up the DB).
  -- To create locally: supabase auth create-user --email $ADMIN_EMAIL --password $ADMIN_PASSWORD
  select id into _user_id from auth.users where email = current_setting('app.e2e_admin_email', true) limit 1;

  if _user_id is not null then
    insert into public.admin_users (user_id, tenant_id, role, location_id)
    values (_user_id, _tenant_id, 'owner', null);
  end if;
end;
$$;
