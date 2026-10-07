-- Approved sales grouped by the source the gateway reported (utm_source). Nothing is inferred:
-- the value is exactly what the buyer's link carried (e.g. fb, ig, organic, www.google.com);
-- sales that arrived without one are grouped as 'n/a'. SECURITY INVOKER: RLS applies.
create or replace function public.sales_by_source(p_project uuid, p_from timestamptz, p_to timestamptz)
returns table (source text, orders bigint, revenue bigint)
language sql stable as $$
  select
    coalesce(nullif(lower(btrim(o.tracking ->> 'utm_source')), ''), 'n/a') as source,
    count(*)::bigint,
    sum(o.gross_amount)::bigint
  from public.orders o
  where o.project_id = p_project
    and o.status = 'approved'
    and o.approved_at >= p_from and o.approved_at < p_to
  group by 1
  order by count(*) desc, 1
  limit 20;
$$;

grant execute on function public.sales_by_source(uuid, timestamptz, timestamptz) to authenticated;
revoke execute on function public.sales_by_source(uuid, timestamptz, timestamptz) from anon, public;
