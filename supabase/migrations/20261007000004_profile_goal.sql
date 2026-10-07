-- Profile photos (public-read bucket, unguessable paths, writes only through the server) and the
-- project's gross revenue goal.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];
-- No storage.objects write policies on purpose: clients cannot upload; the server uses the service role.

-- Goal in cents. Default R$ 1.000.000,00.
alter table public.projects add column revenue_goal_cents bigint not null default 100000000
  check (revenue_goal_cents > 0);

-- Lifetime gross revenue: every sale that was ever approved (refunds are shown separately elsewhere).
-- SECURITY INVOKER: RLS applies.
create or replace function public.gross_revenue_total(p_project uuid)
returns bigint
language sql stable as $$
  select coalesce(sum(gross_amount), 0)::bigint
  from public.orders
  where project_id = p_project and approved_at is not null;
$$;

grant execute on function public.gross_revenue_total(uuid) to authenticated;
revoke execute on function public.gross_revenue_total(uuid) from anon, public;
