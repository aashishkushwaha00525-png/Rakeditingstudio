-- RAK Editing Studio account system — Supabase SQL foundation
-- Run once in Supabase SQL Editor after creating a project.
-- Never place a Supabase service_role key in website code or GitHub.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.studio_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_studio_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.studio_admins a where a.user_id = auth.uid()
  );
$$;

revoke all on function public.is_studio_admin() from public;
grant execute on function public.is_studio_admin() to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.saved_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  prompt_text text not null check (char_length(prompt_text) between 1 and 12000),
  created_at timestamptz not null default now()
);

create table if not exists public.premium_prompts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  prompt_text text not null check (char_length(prompt_text) between 1 and 12000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.advanced_tools (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  url text not null check (url ~ '^https://'),
  created_at timestamptz not null default now()
);

create table if not exists public.customer_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service_type text not null check (char_length(service_type) between 1 and 120),
  details text not null check (char_length(details) between 1 and 2000),
  status text not null default 'received'
    check (status in ('received', 'reviewing', 'in_progress', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_visits (
  id bigint generated always as identity primary key,
  visitor_id uuid not null,
  visit_date date not null default current_date,
  page_path text not null default '/',
  created_at timestamptz not null default now(),
  unique (visitor_id, visit_date, page_path)
);

create table if not exists public.login_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.studio_admins enable row level security;
alter table public.saved_prompts enable row level security;
alter table public.premium_prompts enable row level security;
alter table public.advanced_tools enable row level security;
alter table public.customer_orders enable row level security;
alter table public.site_visits enable row level security;
alter table public.login_events enable row level security;

drop policy if exists "profiles_read_own_or_admin" on public.profiles;
create policy "profiles_read_own_or_admin" on public.profiles
for select to authenticated
using (auth.uid() = id or public.is_studio_admin());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "saved_prompts_owner_only" on public.saved_prompts;
create policy "saved_prompts_owner_only" on public.saved_prompts
for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "premium_prompts_login_read" on public.premium_prompts;
create policy "premium_prompts_login_read" on public.premium_prompts
for select to authenticated
using (true);

drop policy if exists "premium_prompts_admin_manage" on public.premium_prompts;
create policy "premium_prompts_admin_manage" on public.premium_prompts
for all to authenticated
using (public.is_studio_admin())
with check (public.is_studio_admin());

drop policy if exists "advanced_tools_login_read" on public.advanced_tools;
create policy "advanced_tools_login_read" on public.advanced_tools
for select to authenticated
using (true);

drop policy if exists "advanced_tools_admin_manage" on public.advanced_tools;
create policy "advanced_tools_admin_manage" on public.advanced_tools
for all to authenticated
using (public.is_studio_admin())
with check (public.is_studio_admin());

drop policy if exists "orders_read_own_or_admin" on public.customer_orders;
create policy "orders_read_own_or_admin" on public.customer_orders
for select to authenticated
using (auth.uid() = user_id or public.is_studio_admin());

drop policy if exists "orders_create_own" on public.customer_orders;
create policy "orders_create_own" on public.customer_orders
for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "orders_admin_update" on public.customer_orders;
create policy "orders_admin_update" on public.customer_orders
for update to authenticated
using (public.is_studio_admin())
with check (public.is_studio_admin());

drop policy if exists "site_visits_admin_read" on public.site_visits;
create policy "site_visits_admin_read" on public.site_visits
for select to authenticated
using (public.is_studio_admin());

drop policy if exists "login_events_admin_read" on public.login_events;
create policy "login_events_admin_read" on public.login_events
for select to authenticated
using (public.is_studio_admin());

create or replace function public.record_site_visit(p_visitor_id uuid, p_page_path text default '/')
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  clean_path text;
begin
  if p_visitor_id is null then
    raise exception 'visitor id required';
  end if;
  clean_path := left(coalesce(nullif(p_page_path, ''), '/'), 200);
  if clean_path !~ '^/[a-zA-Z0-9/_-]*$' then
    clean_path := '/';
  end if;
  insert into public.site_visits (visitor_id, visit_date, page_path)
  values (p_visitor_id, current_date, clean_path)
  on conflict (visitor_id, visit_date, page_path) do nothing;
end;
$$;

revoke all on function public.record_site_visit(uuid, text) from public;
grant execute on function public.record_site_visit(uuid, text) to anon, authenticated;

create or replace function public.record_login_event()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'login required';
  end if;
  insert into public.login_events (user_id) values (auth.uid());
end;
$$;

revoke all on function public.record_login_event() from public;
grant execute on function public.record_login_event() to authenticated;

create or replace function public.get_studio_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.is_studio_admin() then
    raise exception 'studio admin access required';
  end if;

  select jsonb_build_object(
    'registered_customers', (select count(*) from public.profiles),
    'visits_total', (select count(*) from public.site_visits),
    'unique_visitors_30d', (select count(distinct visitor_id) from public.site_visits where visit_date >= current_date - 29),
    'page_views_30d', (select count(*) from public.site_visits where visit_date >= current_date - 29),
    'logged_in_users_30d', (select count(distinct user_id) from public.login_events where occurred_at >= now() - interval '30 days'),
    'orders_total', (select count(*) from public.customer_orders),
    'orders_pending', (select count(*) from public.customer_orders where status in ('received', 'reviewing'))
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_studio_dashboard_stats() from public;
grant execute on function public.get_studio_dashboard_stats() to authenticated;
