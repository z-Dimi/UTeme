-- Foundation: profiles, organizations, members, projects + RLS.
-- Money columns elsewhere are bigint cents; nothing financial lives here yet.

create extension if not exists pgcrypto;

create type public.org_role as enum ('owner', 'admin', 'analyst', 'media_buyer', 'viewer');

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------- organizations
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_updated before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

-- ---------------------------------------------------------------- projects
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  timezone text not null default 'America/Sao_Paulo',
  currency char(3) not null default 'BRL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_org_idx on public.projects (organization_id);
create trigger projects_updated before update on public.projects
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------- RLS helpers
-- SECURITY DEFINER so policies on organization_members do not recurse.
create or replace function public.is_org_member(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org and user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(org uuid, roles public.org_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org and user_id = auth.uid() and role = any (roles)
  );
$$;

revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.has_org_role(uuid, public.org_role[]) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.org_role[]) to authenticated;

-- --------------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.projects enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy organizations_select_member on public.organizations for select to authenticated
  using (public.is_org_member(id));
create policy organizations_update_admin on public.organizations for update to authenticated
  using (public.has_org_role(id, array['owner','admin']::public.org_role[]))
  with check (public.has_org_role(id, array['owner','admin']::public.org_role[]));
create policy organizations_delete_owner on public.organizations for delete to authenticated
  using (public.has_org_role(id, array['owner']::public.org_role[]));
-- No INSERT policy: organizations are created through create_organization().

create policy members_select_member on public.organization_members for select to authenticated
  using (public.is_org_member(organization_id));
-- The owner row is only ever created by create_organization(); admins cannot mint or touch owners.
create policy members_insert_admin on public.organization_members for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['owner','admin']::public.org_role[])
    and role <> 'owner'
  );
create policy members_update_admin on public.organization_members for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]) and role <> 'owner')
  with check (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]) and role <> 'owner');
create policy members_delete_admin on public.organization_members for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]) and role <> 'owner');

create policy projects_select_member on public.projects for select to authenticated
  using (public.is_org_member(organization_id));
create policy projects_insert_admin on public.projects for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));
create policy projects_update_admin on public.projects for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));
create policy projects_delete_admin on public.projects for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));

-- ------------------------------------------------------------- bootstrap RPC
create or replace function public.create_organization(
  org_name text,
  org_slug text,
  project_name text,
  project_timezone text default 'America/Sao_Paulo'
) returns table (organization_id uuid, project_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  new_org uuid;
  new_project uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (org_name, org_slug, uid) returning id into new_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org, uid, 'owner');

  insert into public.projects (organization_id, name, timezone)
  values (new_org, project_name, project_timezone) returning id into new_project;

  return query select new_org, new_project;
end $$;

revoke all on function public.create_organization(text, text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text, text) to authenticated;
