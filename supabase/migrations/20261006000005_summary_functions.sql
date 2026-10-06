-- Dashboard aggregations. SECURITY INVOKER (default): they run with the caller's JWT, so RLS on
-- orders decides what is summed; a non-member gets zeros. Cohort = sales approved in the window;
-- refunds/chargebacks are attributed to the sale's approval date.

create or replace function public.summary_totals(p_project uuid, p_from timestamptz, p_to timestamptz)
returns table (
  approved_orders bigint,
  gross_revenue bigint,
  refund_amount bigint,
  refund_orders bigint,
  chargeback_amount bigint,
  chargeback_orders bigint,
  gateway_fees bigint,
  taxes bigint,
  product_costs bigint,
  pending_amount bigint,
  pending_orders bigint
)
language sql stable as $$
  select
    count(*) filter (where o.approved_at >= p_from and o.approved_at < p_to),
    coalesce(sum(o.gross_amount) filter (where o.approved_at >= p_from and o.approved_at < p_to), 0)::bigint,
    coalesce(sum(o.refund_amount) filter (where o.approved_at >= p_from and o.approved_at < p_to), 0)::bigint,
    count(*) filter (where o.approved_at >= p_from and o.approved_at < p_to and o.status = 'refunded'),
    coalesce(sum(o.chargeback_amount) filter (where o.approved_at >= p_from and o.approved_at < p_to), 0)::bigint,
    count(*) filter (where o.approved_at >= p_from and o.approved_at < p_to and o.status = 'chargeback'),
    coalesce(sum(o.gateway_fee_amount) filter (where o.approved_at >= p_from and o.approved_at < p_to), 0)::bigint,
    coalesce(sum(o.tax_amount) filter (where o.approved_at >= p_from and o.approved_at < p_to), 0)::bigint,
    coalesce(sum(o.product_cost_amount) filter (where o.approved_at >= p_from and o.approved_at < p_to), 0)::bigint,
    coalesce(sum(o.gross_amount) filter (where o.status = 'pending' and o.ordered_at >= p_from and o.ordered_at < p_to), 0)::bigint,
    count(*) filter (where o.status = 'pending' and o.ordered_at >= p_from and o.ordered_at < p_to)
  from public.orders o
  where o.project_id = p_project;
$$;

-- Net result per hour of approval (net revenue minus product cost). Ad spend is not allocated by hour.
create or replace function public.hourly_results(p_project uuid, p_from timestamptz, p_to timestamptz, p_tz text)
returns table (hour integer, orders bigint, result bigint)
language sql stable as $$
  select
    extract(hour from o.approved_at at time zone p_tz)::int,
    count(*),
    sum(o.gross_amount - o.refund_amount - o.chargeback_amount - o.gateway_fee_amount - o.tax_amount - o.product_cost_amount)::bigint
  from public.orders o
  where o.project_id = p_project and o.approved_at >= p_from and o.approved_at < p_to
  group by 1
  order by 1;
$$;

grant execute on function public.summary_totals(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.hourly_results(uuid, timestamptz, timestamptz, text) to authenticated;
revoke execute on function public.summary_totals(uuid, timestamptz, timestamptz) from anon, public;
revoke execute on function public.hourly_results(uuid, timestamptz, timestamptz, text) from anon, public;
