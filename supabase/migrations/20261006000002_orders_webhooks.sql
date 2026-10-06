-- Financial ingestion: integrations, webhook inbox, customers, products, orders, order events.
-- Money is bigint cents. Writes to these tables happen server-side (service role) only;
-- authenticated users get read access scoped by organization membership.

-- ------------------------------------------------------------ integrations
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  provider text not null check (provider in ('cakto', 'custom')),
  name text not null check (char_length(name) between 2 and 80),
  status text not null default 'active' check (status in ('active', 'inactive')),
  -- AES-256-GCM envelope produced by the app (ENCRYPTION_KEY). Never exposed to clients.
  secret_encrypted text not null,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index integrations_project_idx on public.integrations (project_id);
create trigger integrations_updated before update on public.integrations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------- webhook inbox
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  integration_id uuid not null references public.integrations (id) on delete cascade,
  provider text not null,
  provider_event_id text,
  fingerprint text not null,
  event_type text,
  external_order_id text,
  payload jsonb not null,
  headers jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'processing', 'processed', 'ignored', 'failed')),
  error_message text,
  attempt_count integer not null default 0,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (integration_id, fingerprint)
);
create index webhook_events_project_received_idx on public.webhook_events (project_id, received_at desc);
create index webhook_events_status_idx on public.webhook_events (project_id, status);

-- --------------------------------------------------- customers / products
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null,
  name text,
  phone text,
  document text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, email)
);
create trigger customers_updated before update on public.customers
  for each row execute function public.set_updated_at();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  provider text not null,
  external_id text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, provider, external_id)
);
create trigger products_updated before update on public.products
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------ orders
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  integration_id uuid references public.integrations (id) on delete set null,
  provider text not null,
  external_order_id text not null,
  status text not null check (status in ('pending', 'approved', 'refunded', 'chargeback', 'cancelled', 'failed')),
  payment_method text,
  installments integer,
  currency char(3) not null default 'BRL',
  gross_amount bigint not null check (gross_amount >= 0),
  discount_amount bigint not null default 0,
  gateway_fee_amount bigint not null default 0,
  tax_amount bigint not null default 0,
  product_cost_amount bigint not null default 0,
  refund_amount bigint not null default 0,
  chargeback_amount bigint not null default 0,
  net_amount bigint not null default 0,
  customer_id uuid references public.customers (id) on delete set null,
  fee_rule_id uuid,
  fee_snapshot jsonb,
  -- tracking hints sent by the gateway (utm_*, sck, fbc, fbp). Never used to invent attribution.
  tracking jsonb not null default '{}'::jsonb,
  ordered_at timestamptz not null,
  approved_at timestamptz,
  refunded_at timestamptz,
  chargeback_at timestamptz,
  raw_source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, provider, external_order_id)
);
create index orders_project_approved_idx on public.orders (project_id, approved_at desc);
create index orders_project_ordered_idx on public.orders (project_id, ordered_at desc);
create index orders_project_status_idx on public.orders (project_id, status);
create trigger orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  name text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_amount bigint not null check (unit_amount >= 0)
);
create index order_items_order_idx on public.order_items (order_id);

-- Append-only history.
create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  webhook_event_id uuid references public.webhook_events (id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  result text not null check (result in ('applied', 'noop', 'rejected')),
  amount bigint,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, occurred_at);

create or replace function public.forbid_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;
create trigger order_events_append_only before update or delete on public.order_events
  for each row execute function public.forbid_mutation();

-- --------------------------------------------------------------------- RLS
alter table public.integrations enable row level security;
alter table public.webhook_events enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;

create policy integrations_select on public.integrations for select to authenticated
  using (public.is_org_member(organization_id));
create policy webhook_events_select on public.webhook_events for select to authenticated
  using (public.is_org_member(organization_id));
create policy customers_select on public.customers for select to authenticated
  using (public.is_org_member(organization_id));
create policy products_select on public.products for select to authenticated
  using (public.is_org_member(organization_id));
create policy orders_select on public.orders for select to authenticated
  using (public.is_org_member(organization_id));
create policy order_items_select on public.order_items for select to authenticated
  using (public.is_org_member(organization_id));
create policy order_events_select on public.order_events for select to authenticated
  using (public.is_org_member(organization_id));

-- Clients may only read; all writes go through the service role on the server.
revoke all on public.integrations, public.webhook_events, public.customers, public.products,
  public.orders, public.order_items, public.order_events from anon, authenticated;
grant select on public.webhook_events, public.customers, public.products,
  public.orders, public.order_items, public.order_events to authenticated;
-- Secret column is deliberately not granted.
grant select (id, organization_id, project_id, provider, name, status, last_event_at, created_at, updated_at)
  on public.integrations to authenticated;
