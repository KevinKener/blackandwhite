-- 006_redeem_points_rpc.sql
-- Atomic redemption RPC — mirrors complete_order() pattern.
--
-- Why SECURITY DEFINER + manual tenant validation instead of RLS:
--   The function needs to update point_transactions (bypassing RLS to avoid a
--   deadlock with the row-level lock) and insert into redemptions in one
--   transaction. SECURITY DEFINER + explicit tenant_id checks replicate the
--   same isolation guarantee that RLS would provide.
--
-- Why FOR UPDATE NOWAIT:
--   Two employees at the same local could simultaneously scan a customer's
--   balance, both see 10 points, and both approve a 10-point redemption,
--   resulting in -10 points. NOWAIT lets the second request fail fast with
--   55P03 (lock_not_available) instead of waiting and double-spending.
--
-- Error codes used (SQLSTATE P00xx = application-defined):
--   P0001 — missing tenant_id claim in JWT
--   P0002 — insufficient role
--   P0003 — invalid points_to_redeem
--   P0004 — reward_type blank
--   P0005 — customer not found / wrong tenant
--   P0006 — insufficient points balance

create or replace function public.redeem_points(
  p_customer_id      uuid,
  p_points_to_redeem integer,
  p_reward_type      text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _tenant_id  uuid    := public.jwt_tenant_id();
  _role       text    := public.jwt_role();
  _tx_ids     uuid[];
  _tx_amounts integer[];
  _balance    integer;
  _remaining  integer;
  _deduct     integer;
  _i          integer;
  _redemption record;
begin
  -- 1. Validate caller claims
  if _tenant_id is null then
    raise exception 'tenant_id claim missing — verify auth hook is registered'
      using errcode = 'P0001';
  end if;

  if _role not in ('owner', 'manager') then
    raise exception 'insufficient role: %', _role
      using errcode = 'P0002';
  end if;

  -- 2. Validate inputs
  if p_points_to_redeem is null or p_points_to_redeem < 1 then
    raise exception 'points_to_redeem must be a positive integer'
      using errcode = 'P0003';
  end if;

  if p_reward_type is null or trim(p_reward_type) = '' then
    raise exception 'reward_type is required'
      using errcode = 'P0004';
  end if;

  -- 3. Verify customer belongs to caller's tenant
  if not exists (
    select 1 from public.customers
    where id = p_customer_id
      and tenant_id = _tenant_id
  ) then
    raise exception 'customer not found'
      using errcode = 'P0005';
  end if;

  -- 4. Lock all active point_transactions for this customer (FIFO order) and
  --    read their IDs, balances, and total.
  --    FOR UPDATE NOWAIT must be in a subquery — PostgreSQL does not allow it
  --    directly on queries with aggregate functions. The subquery locks the rows;
  --    the outer SELECT aggregates the locked result set.
  select
    array_agg(id            order by expires_at asc),
    array_agg(remaining_points order by expires_at asc),
    coalesce(sum(remaining_points), 0)
  into _tx_ids, _tx_amounts, _balance
  from (
    select id, remaining_points, expires_at
    from public.point_transactions
    where tenant_id    = _tenant_id
      and customer_id  = p_customer_id
      and remaining_points > 0
      and expires_at   > now()
    for update nowait
  ) locked_rows;

  -- 5. Check sufficient balance
  if _balance < p_points_to_redeem then
    raise exception 'insufficient points: balance is %, requested %',
      _balance, p_points_to_redeem
      using errcode = 'P0006';
  end if;

  -- 6. FIFO deduction — consume soonest-to-expire rows first
  _remaining := p_points_to_redeem;
  _i := 1;
  while _remaining > 0 and _i <= array_length(_tx_ids, 1) loop
    _deduct := least(_tx_amounts[_i], _remaining);
    update public.point_transactions
    set    remaining_points = remaining_points - _deduct
    where  id = _tx_ids[_i];
    _remaining := _remaining - _deduct;
    _i := _i + 1;
  end loop;

  -- 7. Insert redemption record
  insert into public.redemptions (tenant_id, customer_id, points_redeemed, reward_type)
  values (_tenant_id, p_customer_id, p_points_to_redeem, trim(p_reward_type))
  returning * into _redemption;

  -- 8. Return redemption data + remaining balance
  return jsonb_build_object(
    'id',              _redemption.id,
    'tenant_id',       _redemption.tenant_id,
    'customer_id',     _redemption.customer_id,
    'points_redeemed', _redemption.points_redeemed,
    'reward_type',     _redemption.reward_type,
    'created_at',      _redemption.created_at,
    'new_balance',     _balance - p_points_to_redeem
  );
end;
$$;

grant execute on function public.redeem_points(uuid, integer, text) to authenticated;
revoke execute on function public.redeem_points(uuid, integer, text) from public;
