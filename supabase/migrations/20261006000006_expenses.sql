-- Manual expenses. Recurrence is intentionally not modelled yet (no fake promise): each row is one expense.

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  category text not null check (category in ('creative', 'influencer', 'software', 'staff', 'freelancer', 'other')),
  amount bigint not null check (amount > 0),
  incurred_on date not null,
  note text check (note is null or char_length(note) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index expenses_project_date_idx on public.expenses (project_id, incurred_on desc);

alter table public.expenses enable row level security;
create policy expenses_select on public.expenses for select to authenticated
  using (public.is_org_member(organization_id));
revoke all on public.expenses from anon, authenticated;
grant select on public.expenses to authenticated;

create or replace function public.expenses_total(p_project uuid, p_from date, p_to date)
returns bigint
language sql stable as $$
  select coalesce(sum(amount), 0)::bigint
  from public.expenses
  where project_id = p_project and incurred_on >= p_from and incurred_on < p_to;
$$;
grant execute on function public.expenses_total(uuid, date, date) to authenticated;
revoke execute on function public.expenses_total(uuid, date, date) from anon, public;
