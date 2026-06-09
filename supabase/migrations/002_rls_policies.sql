-- 002_rls_policies.sql
-- Row Level Security policies for all tables.
-- Auth Hook (T3) must inject these claims into app_metadata of the JWT:
--   tenant_id   uuid   — tenant of the authenticated admin
--   role        text   — 'owner' | 'manager'
--   location_id uuid   — null for owner, required for manager
--
-- Until T3 is deployed, helper functions return NULL → no row is accessible,
-- which is the safe default (deny by default).

-- ---------------------------------------------------------------------------
-- Helper functions  (security definer so RLS expressions can read JWT claims
-- without each policy needing explicit EXECUTE grants)
-- ---------------------------------------------------------------------------

create or replace function public.jwt_tenant_id()
returns uuid language sql stable security definer
as $$
  select (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
$$;

create or replace function public.jwt_role()
returns text language sql stable security definer
as $$
  select auth.jwt() -> 'app_metadata' ->> 'role'
$$;

create or replace function public.jwt_location_id()
returns uuid language sql stable security definer
as $$
  select (auth.jwt() -> 'app_metadata' ->> 'location_id')::uuid
$$;

-- ---------------------------------------------------------------------------
-- tenants  — admin can read their own tenant row, no client writes
-- ---------------------------------------------------------------------------

alter table public.tenants enable row level security;

create policy "tenants: admin reads own tenant"
  on public.tenants for select
  to authenticated
  using (id = public.jwt_tenant_id());

-- ---------------------------------------------------------------------------
-- locations  — all admins read; only owner writes
-- ---------------------------------------------------------------------------

alter table public.locations enable row level security;

create policy "locations: admin reads own tenant"
  on public.locations for select
  to authenticated
  using (tenant_id = public.jwt_tenant_id());

create policy "locations: owner inserts"
  on public.locations for insert
  to authenticated
  with check (tenant_id = public.jwt_tenant_id() and public.jwt_role() = 'owner');

create policy "locations: owner updates"
  on public.locations for update
  to authenticated
  using  (tenant_id = public.jwt_tenant_id() and public.jwt_role() = 'owner')
  with check (tenant_id = public.jwt_tenant_id() and public.jwt_role() = 'owner');

create policy "locations: owner deletes"
  on public.locations for delete
  to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.jwt_role() = 'owner');

-- ---------------------------------------------------------------------------
-- tenant_settings  — all admins read; only owner updates; no client inserts
-- (bootstrap trigger on tenants handles INSERT)
-- ---------------------------------------------------------------------------

alter table public.tenant_settings enable row level security;

create policy "tenant_settings: admin reads own tenant"
  on public.tenant_settings for select
  to authenticated
  using (tenant_id = public.jwt_tenant_id());

create policy "tenant_settings: owner updates"
  on public.tenant_settings for update
  to authenticated
  using  (tenant_id = public.jwt_tenant_id() and public.jwt_role() = 'owner')
  with check (tenant_id = public.jwt_tenant_id() and public.jwt_role() = 'owner');

-- ---------------------------------------------------------------------------
-- admin_users  — all admins read; only owner writes
-- ---------------------------------------------------------------------------

alter table public.admin_users enable row level security;

create policy "admin_users: admin reads own tenant"
  on public.admin_users for select
  to authenticated
  using (tenant_id = public.jwt_tenant_id());

create policy "admin_users: owner inserts"
  on public.admin_users for insert
  to authenticated
  with check (tenant_id = public.jwt_tenant_id() and public.jwt_role() = 'owner');

create policy "admin_users: owner updates"
  on public.admin_users for update
  to authenticated
  using  (tenant_id = public.jwt_tenant_id() and public.jwt_role() = 'owner')
  with check (tenant_id = public.jwt_tenant_id() and public.jwt_role() = 'owner');

create policy "admin_users: owner deletes"
  on public.admin_users for delete
  to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.jwt_role() = 'owner');

-- ---------------------------------------------------------------------------
-- customers  — all admins read + write (managers create customers when
-- completing orders); only owner deletes
-- ---------------------------------------------------------------------------

alter table public.customers enable row level security;

create policy "customers: admin reads own tenant"
  on public.customers for select
  to authenticated
  using (tenant_id = public.jwt_tenant_id());

create policy "customers: admin inserts own tenant"
  on public.customers for insert
  to authenticated
  with check (tenant_id = public.jwt_tenant_id());

create policy "customers: admin updates own tenant"
  on public.customers for update
  to authenticated
  using  (tenant_id = public.jwt_tenant_id())
  with check (tenant_id = public.jwt_tenant_id());

create policy "customers: owner deletes"
  on public.customers for delete
  to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.jwt_role() = 'owner');

-- ---------------------------------------------------------------------------
-- orders  — owner sees all; manager sees only their location
-- ---------------------------------------------------------------------------

alter table public.orders enable row level security;

create policy "orders: admin reads own tenant scoped by role"
  on public.orders for select
  to authenticated
  using (
    tenant_id = public.jwt_tenant_id()
    and (
      public.jwt_role() = 'owner'
      or location_id = public.jwt_location_id()
    )
  );

create policy "orders: admin inserts own tenant scoped by role"
  on public.orders for insert
  to authenticated
  with check (
    tenant_id = public.jwt_tenant_id()
    and (
      public.jwt_role() = 'owner'
      or location_id = public.jwt_location_id()
    )
  );

create policy "orders: admin updates own tenant scoped by role"
  on public.orders for update
  to authenticated
  using (
    tenant_id = public.jwt_tenant_id()
    and (
      public.jwt_role() = 'owner'
      or location_id = public.jwt_location_id()
    )
  )
  with check (
    tenant_id = public.jwt_tenant_id()
    and (
      public.jwt_role() = 'owner'
      or location_id = public.jwt_location_id()
    )
  );

create policy "orders: owner deletes"
  on public.orders for delete
  to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.jwt_role() = 'owner');

-- ---------------------------------------------------------------------------
-- point_transactions  — all admins read; no client writes
-- (complete_order() RPC uses SECURITY DEFINER and handles all writes)
-- ---------------------------------------------------------------------------

alter table public.point_transactions enable row level security;

create policy "point_transactions: admin reads own tenant"
  on public.point_transactions for select
  to authenticated
  using (tenant_id = public.jwt_tenant_id());

-- ---------------------------------------------------------------------------
-- redemptions  — all admins read + insert; no update/delete (immutable ledger)
-- ---------------------------------------------------------------------------

alter table public.redemptions enable row level security;

create policy "redemptions: admin reads own tenant"
  on public.redemptions for select
  to authenticated
  using (tenant_id = public.jwt_tenant_id());

create policy "redemptions: admin inserts own tenant"
  on public.redemptions for insert
  to authenticated
  with check (tenant_id = public.jwt_tenant_id());

-- ---------------------------------------------------------------------------
-- menu_items  — all admins read; only owner inserts/deletes;
-- owner or manager for their location can update
-- ---------------------------------------------------------------------------

alter table public.menu_items enable row level security;

create policy "menu_items: admin reads own tenant"
  on public.menu_items for select
  to authenticated
  using (tenant_id = public.jwt_tenant_id());

create policy "menu_items: owner inserts"
  on public.menu_items for insert
  to authenticated
  with check (tenant_id = public.jwt_tenant_id() and public.jwt_role() = 'owner');

create policy "menu_items: owner or manager updates own location"
  on public.menu_items for update
  to authenticated
  using (
    tenant_id = public.jwt_tenant_id()
    and (
      public.jwt_role() = 'owner'
      or location_id = public.jwt_location_id()
    )
  )
  with check (
    tenant_id = public.jwt_tenant_id()
    and (
      public.jwt_role() = 'owner'
      or location_id = public.jwt_location_id()
    )
  );

create policy "menu_items: owner deletes"
  on public.menu_items for delete
  to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.jwt_role() = 'owner');
