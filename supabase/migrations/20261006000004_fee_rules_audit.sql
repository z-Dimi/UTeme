-- Financial rules (gateway fees, revenue taxes, product costs, Meta Ads tax) + audit log.
-- Rules are never edited in place: a change closes the old row (valid_until) and inserts a new one,
-- so every past sale keeps resolving to the rule that was valid when it happened.

create table public.fee_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('gateway_fee', 'tax', 'product_cost', 'meta_ads_tax')),
  name text not null check (char_length(name) between 2 and 80),
  provider text,
  external_product_id text,
  payment_method text,
  installment_min integer check (installment_min is null or installment_min >= 1),
  installment_max integer check (installment_max is null or installment_max >= 1),
  percentage numeric(7, 4) not null default 0 check (percentage >= 0 and percentage <= 100),
  fixed_amount bigint not null default 0 check (fixed_amount >= 0),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (valid_until is null or valid_until > valid_from),
  check (installment_max is null or installment_min is null or installment_max >= installment_min)
);
create index fee_rules_project_kind_idx on public.fee_rules (project_id, kind, valid_from desc);

alter table public.orders
  add constraint orders_fee_rule_fk foreign key (fee_rule_id) references public.fee_rules (id) on delete set null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_org_idx on public.audit_logs (organization_id, created_at desc);

alter table public.fee_rules enable row level security;
alter table public.audit_logs enable row level security;

create policy fee_rules_select on public.fee_rules for select to authenticated
  using (public.is_org_member(organization_id));
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));

revoke all on public.fee_rules, public.audit_logs from anon, authenticated;
grant select on public.fee_rules, public.audit_logs to authenticated;
