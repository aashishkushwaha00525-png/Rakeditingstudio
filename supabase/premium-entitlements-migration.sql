-- RAK Editing Studio: premium access entitlement migration
-- Run once in Supabase SQL Editor after reviewing. Does not enable payments.
-- A customer receives access only when an admin grants an active entitlement.

create table if not exists public.customer_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_code text not null check (plan_code in ('monthly', 'yearly', 'complimentary')),
  status text not null default 'inactive' check (status in ('active', 'inactive', 'cancelled', 'expired')),
  expires_at timestamptz,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_entitlements enable row level security;

drop policy if exists "premium_prompts_login_read" on public.premium_prompts;
drop policy if exists "premium_prompts_entitled_read" on public.premium_prompts;
create policy "premium_prompts_entitled_read" on public.premium_prompts
for select to authenticated
using (
  public.is_studio_admin()
  or exists (
    select 1 from public.customer_entitlements e
    where e.user_id = auth.uid()
      and e.status = 'active'
      and (e.expires_at is null or e.expires_at > now())
  )
);

drop policy if exists "entitlements_read_own_or_admin" on public.customer_entitlements;
create policy "entitlements_read_own_or_admin" on public.customer_entitlements
for select to authenticated
using (auth.uid() = user_id or public.is_studio_admin());

drop policy if exists "entitlements_admin_manage" on public.customer_entitlements;
create policy "entitlements_admin_manage" on public.customer_entitlements
for all to authenticated
using (public.is_studio_admin())
with check (public.is_studio_admin());

-- Payment processing/verification is not implemented by this migration.
