-- Units sold per product for sales approved in the window and still approved (refunds/chargebacks excluded).
-- SECURITY INVOKER: RLS on orders/order_items applies.
create or replace function public.product_sales(p_project uuid, p_from timestamptz, p_to timestamptz)
returns table (name text, quantity bigint, revenue bigint)
language sql stable as $$
  select i.name, sum(i.quantity)::bigint, sum(i.quantity * i.unit_amount)::bigint
  from public.order_items i
  join public.orders o on o.id = i.order_id
  where o.project_id = p_project
    and o.status = 'approved'
    and o.approved_at >= p_from and o.approved_at < p_to
  group by i.name
  order by sum(i.quantity) desc, i.name
  limit 50;
$$;

grant execute on function public.product_sales(uuid, timestamptz, timestamptz) to authenticated;
revoke execute on function public.product_sales(uuid, timestamptz, timestamptz) from anon, public;
