-- Meta Ads: connection, structure, daily insights, sync runs.
-- Tokens are AES-GCM encrypted by the app and the column is not granted to clients.
-- Insights are stored at ad level per day (Meta's day = ad account timezone). Money = bigint cents.

create table public.meta_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null unique references public.projects (id) on delete cascade,
  meta_user_id text not null,
  meta_user_name text,
  access_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'connected' check (status in ('connected', 'error', 'disconnected')),
  -- selected after OAuth
  ad_account_id text,
  ad_account_name text,
  ad_account_currency char(3),
  ad_account_timezone text,
  business_id text,
  business_name text,
  pixel_id text,
  pixel_name text,
  backfill_status text not null default 'pending' check (backfill_status in ('pending', 'running', 'done', 'failed')),
  backfill_progress jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_manual_sync_at timestamptz,
  last_error text,
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger meta_connections_updated before update on public.meta_connections
  for each row execute function public.set_updated_at();

create table public.meta_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  external_id text not null,
  name text not null,
  status text,
  objective text,
  updated_at timestamptz not null default now(),
  unique (project_id, external_id)
);
create table public.meta_adsets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  external_id text not null,
  campaign_external_id text not null,
  name text not null,
  status text,
  updated_at timestamptz not null default now(),
  unique (project_id, external_id)
);
create table public.meta_ads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  external_id text not null,
  adset_external_id text not null,
  campaign_external_id text not null,
  name text not null,
  status text,
  updated_at timestamptz not null default now(),
  unique (project_id, external_id)
);
create index meta_adsets_campaign_idx on public.meta_adsets (project_id, campaign_external_id);
create index meta_ads_adset_idx on public.meta_ads (project_id, adset_external_id);

create table public.meta_metrics_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  date date not null,
  ad_account_id text not null,
  campaign_id text not null,
  adset_id text not null,
  ad_id text not null,
  spend bigint not null default 0,
  impressions bigint not null default 0,
  -- reach/frequency are not additive across days/ads: stored per row, never summed in aggregates.
  reach bigint not null default 0,
  clicks bigint not null default 0,
  inline_link_clicks bigint not null default 0,
  outbound_clicks bigint not null default 0,
  landing_page_views bigint not null default 0,
  meta_purchases bigint not null default 0,
  meta_purchase_value bigint not null default 0,
  meta_initiate_checkouts bigint not null default 0,
  meta_add_to_carts bigint not null default 0,
  meta_view_contents bigint not null default 0,
  meta_leads bigint not null default 0,
  actions jsonb,
  action_values jsonb,
  synced_at timestamptz not null default now(),
  unique (project_id, date, ad_id)
);
create index meta_metrics_project_date_idx on public.meta_metrics_daily (project_id, date);
create index meta_metrics_campaign_idx on public.meta_metrics_daily (project_id, campaign_id, date);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  provider text not null,
  type text not null,
  status text not null default 'running' check (status in ('running', 'success', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_processed integer not null default 0,
  error text
);
create index sync_runs_project_idx on public.sync_runs (project_id, started_at desc);

-- ------------------------------------------------------------------- RLS
alter table public.meta_connections enable row level security;
alter table public.meta_campaigns enable row level security;
alter table public.meta_adsets enable row level security;
alter table public.meta_ads enable row level security;
alter table public.meta_metrics_daily enable row level security;
alter table public.sync_runs enable row level security;

create policy meta_connections_select on public.meta_connections for select to authenticated using (public.is_org_member(organization_id));
create policy meta_campaigns_select on public.meta_campaigns for select to authenticated using (public.is_org_member(organization_id));
create policy meta_adsets_select on public.meta_adsets for select to authenticated using (public.is_org_member(organization_id));
create policy meta_ads_select on public.meta_ads for select to authenticated using (public.is_org_member(organization_id));
create policy meta_metrics_select on public.meta_metrics_daily for select to authenticated using (public.is_org_member(organization_id));
create policy sync_runs_select on public.sync_runs for select to authenticated using (public.is_org_member(organization_id));

revoke all on public.meta_connections, public.meta_campaigns, public.meta_adsets, public.meta_ads,
  public.meta_metrics_daily, public.sync_runs from anon, authenticated;
grant select on public.meta_campaigns, public.meta_adsets, public.meta_ads, public.meta_metrics_daily, public.sync_runs to authenticated;
-- Token column is deliberately not granted.
grant select (id, organization_id, project_id, meta_user_id, meta_user_name, token_expires_at, scopes, status,
  ad_account_id, ad_account_name, ad_account_currency, ad_account_timezone, business_id, business_name,
  pixel_id, pixel_name, backfill_status, backfill_progress, last_sync_at, last_manual_sync_at, last_error,
  connected_at, created_at, updated_at)
  on public.meta_connections to authenticated;

-- ------------------------------------------------------------- aggregations
-- SECURITY INVOKER: RLS applies, non-members get empty results.
create or replace function public.meta_daily(p_project uuid, p_from date, p_to date)
returns table (
  date date, spend bigint, impressions bigint, clicks bigint, inline_link_clicks bigint, outbound_clicks bigint,
  landing_page_views bigint, meta_purchases bigint, meta_purchase_value bigint, meta_initiate_checkouts bigint
)
language sql stable as $$
  select m.date, sum(m.spend)::bigint, sum(m.impressions)::bigint, sum(m.clicks)::bigint,
         sum(m.inline_link_clicks)::bigint, sum(m.outbound_clicks)::bigint, sum(m.landing_page_views)::bigint,
         sum(m.meta_purchases)::bigint, sum(m.meta_purchase_value)::bigint, sum(m.meta_initiate_checkouts)::bigint
  from public.meta_metrics_daily m
  where m.project_id = p_project and m.date >= p_from and m.date < p_to
  group by m.date
  order by m.date;
$$;

-- Period totals per ad; the app rolls them up to ad set and campaign.
create or replace function public.meta_rollup(p_project uuid, p_from date, p_to date)
returns table (
  campaign_id text, adset_id text, ad_id text, spend bigint, impressions bigint, clicks bigint,
  inline_link_clicks bigint, meta_purchases bigint, meta_purchase_value bigint
)
language sql stable as $$
  select m.campaign_id, m.adset_id, m.ad_id, sum(m.spend)::bigint, sum(m.impressions)::bigint, sum(m.clicks)::bigint,
         sum(m.inline_link_clicks)::bigint, sum(m.meta_purchases)::bigint, sum(m.meta_purchase_value)::bigint
  from public.meta_metrics_daily m
  where m.project_id = p_project and m.date >= p_from and m.date < p_to
  group by m.campaign_id, m.adset_id, m.ad_id
  limit 5000;
$$;

grant execute on function public.meta_daily(uuid, date, date) to authenticated;
grant execute on function public.meta_rollup(uuid, date, date) to authenticated;
revoke execute on function public.meta_daily(uuid, date, date) from anon, public;
revoke execute on function public.meta_rollup(uuid, date, date) from anon, public;
