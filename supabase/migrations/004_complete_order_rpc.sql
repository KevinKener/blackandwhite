-- 004_complete_order_rpc.sql
-- complete_order(order_id, customer_phone) — atomic RPC called by the admin PWA
-- when a manager marks an order as completed.
--
-- What it does in one transaction:
--   1. Lock + validate the order (must belong to caller's tenant, must be pending).
--   2. Upsert the customer by (tenant_id, phone) — creates the record if the
--      customer doesn't have one yet (Phase 1: customers may be unknown at order
--      creation time).
--   3. Update the order: status → completed, completed_at → now(),
--      customer_id linked to the upserted customer.
--   4. Read tenant_settings for points_per_order and expiry_days.
--   5. Insert a point_transaction row with remaining_points = points_earned
--      and expires_at = now() + expiry_days.
--
-- Security: SECURITY DEFINER so it can write to point_transactions (which has
-- no direct client write policy in 002). The caller must still be authenticated
-- — jwt_tenant_id() is checked against the order's tenant_id, so a manager
-- from tenant A cannot complete orders belonging to tenant B.

create or replace function public.complete_order(
  p_order_id      uuid,
  p_customer_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller_tenant_id  uuid  := public.jwt_tenant_id();
  _caller_role       text  := public.jwt_role();
  _caller_location   uuid  := public.jwt_location_id();
  _order             orders%rowtype;
  _customer_id       uuid;
  _points_per_order  integer;
  _expiry_days       integer;
  _transaction_id    uuid;
begin
  -- -------------------------------------------------------------------------
  -- 1. Validate caller is an authenticated admin.
  -- -------------------------------------------------------------------------
  if _caller_tenant_id is null then
    raise exception 'unauthorized' using errcode = 'P0001';
  end if;

  -- -------------------------------------------------------------------------
  -- 2. Lock the order row to prevent concurrent completions.
  --    FOR UPDATE NOWAIT raises an error immediately if another transaction
  --    holds the lock, avoiding silent double-completion.
  -- -------------------------------------------------------------------------
  select * into _order
  from   public.orders
  where  id        = p_order_id
    and  tenant_id = _caller_tenant_id
  for update nowait;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  -- Manager can only complete orders from their own location.
  if _caller_role = 'manager' and _order.location_id <> _caller_location then
    raise exception 'access denied' using errcode = 'P0003';
  end if;

  if _order.status = 'completed' then
    raise exception 'order already completed' using errcode = 'P0004';
  end if;

  -- -------------------------------------------------------------------------
  -- 3. Upsert customer by (tenant_id, phone).
  --    ON CONFLICT DO NOTHING + re-select handles the case where the customer
  --    already exists without needing a separate lookup first.
  -- -------------------------------------------------------------------------
  insert into public.customers (tenant_id, phone)
  values (_caller_tenant_id, p_customer_phone)
  on conflict (tenant_id, phone) do nothing;

  select id into _customer_id
  from   public.customers
  where  tenant_id = _caller_tenant_id
    and  phone     = p_customer_phone;

  -- -------------------------------------------------------------------------
  -- 4. Mark the order completed and link the customer.
  -- -------------------------------------------------------------------------
  update public.orders
  set    status       = 'completed',
         completed_at = now(),
         customer_id  = _customer_id
  where  id = p_order_id;

  -- -------------------------------------------------------------------------
  -- 5. Read tenant settings (guaranteed to exist via bootstrap trigger in 001).
  -- -------------------------------------------------------------------------
  select points_per_order, expiry_days
  into   _points_per_order, _expiry_days
  from   public.tenant_settings
  where  tenant_id = _caller_tenant_id;

  -- -------------------------------------------------------------------------
  -- 6. Insert the point transaction.
  -- -------------------------------------------------------------------------
  insert into public.point_transactions (
    tenant_id,
    customer_id,
    order_id,
    points_earned,
    remaining_points,
    expires_at
  )
  values (
    _caller_tenant_id,
    _customer_id,
    p_order_id,
    _points_per_order,
    _points_per_order,
    now() + (_expiry_days || ' days')::interval
  )
  returning id into _transaction_id;

  return jsonb_build_object(
    'order_id',        p_order_id,
    'customer_id',     _customer_id,
    'transaction_id',  _transaction_id,
    'points_earned',   _points_per_order,
    'expires_at',      now() + (_expiry_days || ' days')::interval
  );
end;
$$;

-- Only authenticated admins can call this RPC; anon role cannot.
grant execute on function public.complete_order(uuid, text) to authenticated;
revoke execute on function public.complete_order(uuid, text) from public;
