-- 001_initial_schema.sql
-- Initial schema for Black & White Loyalty & Order Management PWA
-- Run via: supabase db reset (applies all migrations in order)
--
-- What lives here: table definitions, enum types, check constraints,
-- updated_at trigger. RLS policies → 002. Auth Hook → 003.
-- complete_order() RPC → 004. Indexes → 005.

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
-- ---------------------------------------------------------------------------

create table public.locations (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references public.tenants(id) on delete cascade,
  name       text        not null,
  address    text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tenant_settings  (one row per tenant — owner configures points rules)
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
--   manager → location_id is set   (scoped to one location)
-- ---------------------------------------------------------------------------

create table public.admin_users (
  user_id     uuid        primary key references auth.users(id) on delete cascade,
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  role        user_role   not null default 'manager',
  location_id uuid        references public.locations(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- customers  (NOT in auth.users — identified by registration_token in Phase 1)
--   registration_token: server-generated UUID sent via WhatsApp link
--   phone is unique per tenant (same customer, one loyalty account per chain)
-- ---------------------------------------------------------------------------

create table public.customers (
  id                 uuid        primary key default gen_random_uuid(),
  tenant_id          uuid        not null references public.tenants(id) on delete cascade,
  phone              text        not null,
  name               text,
  registration_token uuid        not null unique default gen_random_uuid(),
  created_at         timestamptz not null default now(),

  unique (tenant_id, phone)
);

-- ---------------------------------------------------------------------------
-- orders
--   customer_id is nullable: anonymous orders are valid in Phase 1 when the
--   customer hasn't registered yet (points assigned once they do, or skipped)
-- ---------------------------------------------------------------------------

create table public.orders (
  id           uuid         primary key default gen_random_uuid(),
  tenant_id    uuid         not null references public.tenants(id) on delete cascade,
  location_id  uuid         not null references public.locations(id),
  customer_id  uuid         references public.customers(id) on delete set null,
  status       order_status not null default 'pending',
  source       order_source not null default 'admin_manual',
  created_at   timestamptz  not null default now(),
  completed_at timestamptz
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
-- ---------------------------------------------------------------------------

create table public.point_transactions (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null references public.tenants(id) on delete cascade,
  customer_id      uuid        not null references public.customers(id) on delete cascade,
  order_id         uuid        not null references public.orders(id) on delete cascade,
  points_earned    integer     not null check (points_earned > 0),
  remaining_points integer     not null check (remaining_points >= 0),
  expires_at       timestamptz not null,
  created_at       timestamptz not null default now(),

  check (remaining_points <= points_earned)
);

-- ---------------------------------------------------------------------------
-- redemptions
-- ---------------------------------------------------------------------------

create table public.redemptions (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references public.tenants(id) on delete cascade,
  customer_id     uuid        not null references public.customers(id) on delete cascade,
  points_redeemed integer     not null check (points_redeemed > 0),
  reward_type     text        not null,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- menu_items  (Phase 2 — table defined now; stays empty until Phase 2 ships)
--   location_id is always set: prices may vary per location (pending confirmation
--   with owner — see TODOS). Designing for it now avoids a data migration later.
-- ---------------------------------------------------------------------------

create table public.menu_items (
  id              uuid          primary key default gen_random_uuid(),
  tenant_id       uuid          not null references public.tenants(id) on delete cascade,
  location_id     uuid          not null references public.locations(id) on delete cascade,
  name            text          not null,
  price           numeric(10,2) not null check (price >= 0),
  category        text,
  points_eligible boolean       not null default true,
  available       boolean       not null default true,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

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
