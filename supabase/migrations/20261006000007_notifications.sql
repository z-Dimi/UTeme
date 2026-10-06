create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  type text not null check (type in ('webhook_failed', 'chargeback_received', 'integration_disconnected', 'meta_sync_failed', 'meta_token_expiring', 'high_refund_rate')),
  title text not null,
  body text,
  link text,
  -- Same condition never notifies twice.
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, dedupe_key)
);
create index notifications_project_idx on public.notifications (project_id, created_at desc);
create index notifications_unread_idx on public.notifications (project_id) where read_at is null;

alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated
  using (public.is_org_member(organization_id));
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
