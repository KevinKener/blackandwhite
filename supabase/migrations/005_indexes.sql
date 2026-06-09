-- 005_indexes.sql
-- Performance indexes. Tables already have implicit indexes on primary keys
-- and on every UNIQUE constraint, so those are not repeated here.
--
-- Naming: idx_<table>_<columns>

-- ---------------------------------------------------------------------------
-- admin_users
--   RLS + auth hook both filter by tenant_id; index avoids seq scan on login.
-- ---------------------------------------------------------------------------

create index idx_admin_users_tenant_id
  on public.admin_users (tenant_id);

-- ---------------------------------------------------------------------------
-- locations
--   Listed and filtered by tenant in every admin view.
-- ---------------------------------------------------------------------------

create index idx_locations_tenant_id
  on public.locations (tenant_id);

-- ---------------------------------------------------------------------------
-- orders
--   Most query-heavy table. Three patterns:
--     a) Admin list view  — tenant + location (manager) or tenant alone (owner),
--        ordered by created_at DESC (pagination).
--     b) Customer history — tenant + customer_id.
--     c) Pending filter   — tenant + status = 'pending'.
-- ---------------------------------------------------------------------------

create index idx_orders_tenant_location_created
  on public.orders (tenant_id, location_id, created_at desc);

create index idx_orders_tenant_customer
  on public.orders (tenant_id, customer_id);

create index idx_orders_tenant_status
  on public.orders (tenant_id, status);

-- ---------------------------------------------------------------------------
-- point_transactions
--   Three patterns:
--     a) Balance query    — sum remaining_points where tenant + customer +
--        expires_at > now() (non-expired rows only).
--     b) FIFO redemption  — same filter, ordered by expires_at ASC to consume
--        soonest-to-expire first.
--     c) Order lookup     — find the transaction created for a given order.
--
--   The partial index on (remaining_points > 0) skips fully-consumed rows,
--   which dominate the table over time and are never needed for balance/FIFO.
-- ---------------------------------------------------------------------------

create index idx_point_transactions_balance
  on public.point_transactions (tenant_id, customer_id, expires_at)
  where remaining_points > 0;

create index idx_point_transactions_order_id
  on public.point_transactions (order_id);

-- ---------------------------------------------------------------------------
-- redemptions
--   Customer redemption history and recent-activity list.
-- ---------------------------------------------------------------------------

create index idx_redemptions_tenant_customer
  on public.redemptions (tenant_id, customer_id);

create index idx_redemptions_tenant_created
  on public.redemptions (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- menu_items
--   Location menu listing; partial index on available = true skips
--   unavailable items that are never shown to staff.
-- ---------------------------------------------------------------------------

create index idx_menu_items_tenant_location_available
  on public.menu_items (tenant_id, location_id)
  where available = true;
