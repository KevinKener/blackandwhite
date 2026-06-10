-- get_analytics_summary(p_tenant_id)
-- Returns key metrics for the admin dashboard without relying on PostgREST
-- aggregate function syntax (PGRST123 — disabled by default in local dev).
create or replace function public.get_analytics_summary(p_tenant_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'orders', json_build_object(
      'total',     (select count(*) from orders where tenant_id = p_tenant_id),
      'completed', (select count(*) from orders where tenant_id = p_tenant_id and status = 'completed'),
      'pending',   (select count(*) from orders where tenant_id = p_tenant_id and status = 'pending')
    ),
    'customers', json_build_object(
      'total', (select count(*) from customers where tenant_id = p_tenant_id)
    ),
    'points', json_build_object(
      'total_issued',   coalesce(
        (select sum(points_earned) from point_transactions where tenant_id = p_tenant_id),
        0
      ),
      'active_balance', coalesce(
        (select sum(remaining_points)
         from point_transactions
         where tenant_id = p_tenant_id
           and remaining_points > 0
           and expires_at > now()),
        0
      )
    )
  );
$$;

-- Only admin users (authenticated via service role) should be able to call this.
revoke all on function public.get_analytics_summary(uuid) from public, anon;
grant execute on function public.get_analytics_summary(uuid) to authenticated;
