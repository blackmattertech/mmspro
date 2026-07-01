-- ══════════════════════════════════════════════════════════════
-- MMS PRO — Database bootstrap (safe to re-run)
-- Run in Supabase → SQL Editor on a fresh or partial project
-- Fixes: relation "profiles" does not exist
--        Database error creating new user
-- ══════════════════════════════════════════════════════════════

-- 1. ORGANIZATIONS
create table if not exists public.organizations (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  slug text unique not null,
  plan text default 'free'
    check (plan in ('free', 'pro', 'enterprise')),
  is_active boolean default true not null,
  created_at timestamptz default now()
);

alter table public.organizations
  add column if not exists is_active boolean default true not null;

-- 2. PROFILES
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  org_id uuid references public.organizations(id) on delete cascade,
  email text,
  role text default 'member'
    check (role in ('owner', 'admin', 'member')),
  created_at timestamptz default now()
);

-- 3. FCM TOKENS
create table if not exists public.fcm_tokens (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  token text unique not null,
  created_at timestamptz default now()
);

-- 4. PROJECTS (example table)
create table if not exists public.projects (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  name text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- 5. ORG INVITES
create table if not exists public.org_invites (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  email text not null,
  role text default 'member',
  token text unique default gen_random_uuid()::text,
  accepted_at timestamptz,
  created_at timestamptz default now()
);

-- 6. PLANTS & WORK ORDERS
create table if not exists public.plants (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists public.work_orders (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  plant_id uuid references public.plants(id) on delete set null,
  work_order_number text not null,
  title text not null,
  description text,
  status text default 'open'
    check (status in ('open', 'in_progress', 'scheduled', 'completed', 'overdue')),
  priority text default 'medium'
    check (priority in ('high', 'medium', 'low')),
  scheduled_at timestamptz,
  completed_at timestamptz,
  sla_due_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- 7. SIGNUP TRIGGER — auto-create profile when auth user is added
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 8. BACKFILL profiles for existing auth users
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do update
  set email = coalesce(excluded.email, public.profiles.email);

-- 9. HELPER: create org for user
create or replace function public.create_org_for_user(
  p_user_id uuid,
  p_org_name text,
  p_org_slug text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_email text;
begin
  select email into v_email from auth.users where id = p_user_id;

  insert into public.profiles (id, email)
  values (p_user_id, v_email)
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email);

  insert into public.organizations (name, slug, email)
  values (p_org_name, p_org_slug, v_email)
  returning id into v_org_id;

  update public.profiles
  set org_id = v_org_id, role = 'owner'
  where id = p_user_id;

  return v_org_id;
end;
$$;

-- 10. ROW LEVEL SECURITY
alter table public.profiles enable row level security;
alter table public.fcm_tokens enable row level security;
alter table public.projects enable row level security;
alter table public.organizations enable row level security;
alter table public.plants enable row level security;
alter table public.work_orders enable row level security;

-- profiles policies
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

drop policy if exists "Auth admin can insert profiles" on public.profiles;
create policy "Auth admin can insert profiles"
  on public.profiles for insert
  to supabase_auth_admin
  with check (true);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- organizations policies
drop policy if exists "Members can view own organization" on public.organizations;
create policy "Members can view own organization"
  on public.organizations for select
  using (id = (select org_id from public.profiles where id = auth.uid()));

-- fcm_tokens policies
drop policy if exists "Users manage own FCM tokens" on public.fcm_tokens;
create policy "Users manage own FCM tokens"
  on public.fcm_tokens for all using (user_id = auth.uid());

-- projects policies
drop policy if exists "Org isolation on projects" on public.projects;
create policy "Org isolation on projects"
  on public.projects for all
  using (org_id = (select org_id from public.profiles where id = auth.uid()));

-- plants policies
drop policy if exists "Org isolation on plants" on public.plants;
create policy "Org isolation on plants"
  on public.plants for all
  using (org_id = (select org_id from public.profiles where id = auth.uid()));

-- work_orders policies
drop policy if exists "Org isolation on work_orders" on public.work_orders;
create policy "Org isolation on work_orders"
  on public.work_orders for all
  using (org_id = (select org_id from public.profiles where id = auth.uid()));

-- Done! Next steps (run separately after creating your first user):
--   update public.profiles set role = 'admin' where email = 'you@example.com';
