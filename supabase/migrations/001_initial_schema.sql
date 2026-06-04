-- 001_initial_schema.sql
-- Initial schema for Black & White Loyalty & Order Management PWA
-- Run via: supabase db reset (applies all migrations in order)
--
-- What lives here: table definitions, enum types, check constraints,
-- updated_at + tenant_settings bootstrap triggers.
-- RLS policies → 002. Auth Hook → 003. complete_order() RPC → 004. Indexes → 005.
--
-- Multi-tenant integrity strategy:
--   Every table carries tenant_id. Cross-tenant FK contamination is prevented
--   at the DB level via composite FKs: e.g. orders(tenant_id, customer_id)
--   → customers(tenant_id, id). This requires UNIQUE(tenant_id, id) on the
--   referenced tables. MATCH SIMPLE (PostgreSQL default) means nullable
--   composite keys (customer_id NULL on anonymous orders, location_id NULL
--   on owner admin_users) are exempt from the constraint — correct behavior.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------

create type public.user_role    as enum ('owner', 'manager');
create type public.order_status as enum ('pending', 'completed');
create type public.order_source as enum ('admin_manual', 'customer_pwa');

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------

create table public.tenants (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- locations
--   unique(tenant_id, id): required for composite FK targets in orders,
--   admin_users, and menu_items to enforce cross-tenant isolation at DB level.
-- ---------------------------------------------------------------------------

create table public.locations (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references public.tenants(id) on delete cascade,
  name       text        not null,
  address    text,
  created_at timestamptz not null default now(),

  unique (tenant_id, id)
);

-- ---------------------------------------------------------------------------
-- tenant_settings  (one row per tenant — owner configures points rules)
--   A bootstrap trigger on tenants ensures this row always exists.
-- ---------------------------------------------------------------------------

create table public.tenant_settings (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null unique references public.tenants(id) on delete cascade,
  points_per_order  integer     not null default 1   check (points_per_order > 0),
  points_for_reward integer     not null default 10  check (points_for_reward > 0),
  expiry_days       integer     not null default 180 check (expiry_days > 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- admin_users  (profile table — references auth.users, populated by Auth Hook)
--   owner   → location_id is null  (sees all locations)
--   manager → location_id is not null  (scoped to one location)
--
--   Composite FK (tenant_id, location_id) → locations(tenant_id, id):
--   prevents assigning a manager to a location from a different tenant.
--   MATCH SIMPLE: location_id NULL (owner) exempts the FK check — correct.
--
--   ON DELETE RESTRICT on location_id: a location cannot be deleted while
--   managers are assigned to it. Required to keep the role/location_id CHECK
--   enforceable (SET NULL would produce an invalid manager with null location).
-- ---------------------------------------------------------------------------

create table public.admin_users (
  user_id     uuid        primary key references auth.users(id) on delete cascade,
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  role        user_role   not null default 'manager',
  location_id uuid,
  created_at  timestamptz not null default now(),

  check (
    (role = 'owner'   and location_id is null) or
    (role = 'manager' and location_id is not null)
  ),

  foreign key (tenant_id, location_id) references public.locations(tenant_id, id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- customers  (NOT in auth.users — identified by registration_token in Phase 1)
--   unique(tenant_id, id): required for composite FK targets in orders,
--   point_transactions, and redemptions.
--   unique(tenant_id, registration_token): token lookup always includes
--   tenant_id — prevents cross-tenant token probing.
-- ---------------------------------------------------------------------------

create table public.customers (
  id                 uuid        primary key default gen_random_uuid(),
  tenant_id          uuid        not null references public.tenants(id) on delete cascade,
  phone              text        not null,
  name               text,
  registration_token uuid        not null default gen_random_uuid(),
  created_at         timestamptz not null default now(),

  unique (tenant_id, id),
  unique (tenant_id, phone),
  unique (tenant_id, registration_token)
);

-- ---------------------------------------------------------------------------
-- orders
--   unique(tenant_id, id): required for composite FK in point_transactions.
--   Composite FKs on location_id and customer_id enforce same-tenant refs.
--   customer_id is nullable for anonymous orders; MATCH SIMPLE exempts the
--   composite FK check when customer_id IS NULL — correct behavior.
--   location_id ON DELETE RESTRICT: orders are historical data.
--   status/completed_at consistency enforced by CHECK constraints.
-- ---------------------------------------------------------------------------

create table public.orders (
  id           uuid         primary key default gen_random_uuid(),
  tenant_id    uuid         not null references public.tenants(id) on delete cascade,
  location_id  uuid         not null,
  customer_id  uuid,
  status       order_status not null default 'pending',
  source       order_source not null default 'admin_manual',
  created_at   timestamptz  not null default now(),
  completed_at timestamptz,

  unique (tenant_id, id),

  check (completed_at is null or completed_at >= created_at),
  check (
    (status = 'completed' and completed_at is not null) or
    (status = 'pending'   and completed_at is null)
  ),

  foreign key (tenant_id, location_id) references public.locations(tenant_id, id) on delete restrict,
  foreign key (tenant_id, customer_id) references public.customers(tenant_id, id) on delete set null
);

-- ---------------------------------------------------------------------------
-- point_transactions  (ledger — one row per earning event)
--
--   Points are a ledger, not a counter. Each row has its own remaining_points
--   and expires_at, enabling per-transaction expiration (expiry_days from
--   tenant_settings) and FIFO redemption (consume soonest-to-expire first).
--
--   remaining_points starts = points_earned and decreases as redemptions
--   consume it. complete_order() RPC maintains this atomically.
--
--   order_id ON DELETE RESTRICT: point transactions are financial records.
--   Orders must not be deleted while point transactions reference them.
--   Composite FKs enforce same-tenant references for both customer and order.
-- ---------------------------------------------------------------------------

create table public.point_transactions (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references public.tenants(id) on delete cascade,
  customer_id      uuid        not null,
  order_id         uuid        not null,
  points_earned    integer     not null check (points_earned > 0),
  remaining_points integer     not null check (remaining_points >= 0),
  expires_at       timestamptz not null,
  created_at       timestamptz not null default now(),

  check (remaining_points <= points_earned),

  foreign key (tenant_id, customer_id) references public.customers(tenant_id, id) on delete cascade,
  foreign key (tenant_id, order_id)    references public.orders(tenant_id, id)    on delete restrict
);

-- ---------------------------------------------------------------------------
-- redemptions
--   Composite FK enforces that the customer belongs to the same tenant.
-- ---------------------------------------------------------------------------

create table public.redemptions (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references public.tenants(id) on delete cascade,
  customer_id     uuid        not null,
  points_redeemed integer     not null check (points_redeemed > 0),
  reward_type     text        not null,
  created_at      timestamptz not null default now(),

  foreign key (tenant_id, customer_id) references public.customers(tenant_id, id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- menu_items  (Phase 2 — table defined now; stays empty until Phase 2 ships)
--   location_id always set (prices may vary per location — see TODOS).
--   ON DELETE RESTRICT: migrate or remove items before deleting a location.
--   Composite FK enforces same-tenant location reference.
-- ---------------------------------------------------------------------------

create table public.menu_items (
  id              uuid          primary key default gen_random_uuid(),
  tenant_id       uuid          not null references public.tenants(id) on delete cascade,
  location_id     uuid          not null,
  name            text          not null,
  price           numeric(10,2) not null check (price >= 0),
  category        text,
  points_eligible boolean       not null default true,
  available       boolean       not null default true,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),

  foreign key (tenant_id, location_id) references public.locations(tenant_id, id) on delete restrict
);

-- ---------------------------------------------------------------------------
-- tenant_settings bootstrap trigger
--   Guarantees every tenant has a settings row with defaults on creation.
--   Prevents complete_order() from failing on the first order of a new tenant.
-- ---------------------------------------------------------------------------

create or replace function public.create_default_tenant_settings()
returns trigger language plpgsql as $$
begin
  insert into public.tenant_settings (tenant_id)
  values (new.id);
  return new;
end;
$$;

create trigger create_tenant_settings_on_insert
  after insert on public.tenants
  for each row execute function public.create_default_tenant_settings();

-- ---------------------------------------------------------------------------
-- updated_at trigger  (shared by any table with an updated_at column)
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_tenant_settings_updated_at
  before update on public.tenant_settings
  for each row execute function public.set_updated_at();

create trigger set_menu_items_updated_at
  before update on public.menu_items
  for each row execute function public.set_updated_at();
