-- ══════════════════════════════════════════
-- 1. ORGANIZATIONS
-- ══════════════════════════════════════════
create table organizations (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  slug text unique not null,        -- URL path: mmspro.in/blackmatter/dashboard
  plan text default 'free'          -- free | pro | enterprise
    check (plan in ('free', 'pro', 'enterprise')),
  created_at timestamptz default now()
);

-- ══════════════════════════════════════════
-- 2. PROFILES (extends auth.users)
-- ══════════════════════════════════════════
create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  org_id uuid references organizations(id) on delete cascade,
  email text,
  role text default 'member'
    check (role in ('owner', 'admin', 'member')),
  created_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ══════════════════════════════════════════
-- 3. FCM TOKENS (push notifications)
-- ══════════════════════════════════════════
create table fcm_tokens (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  token text unique not null,       -- one row per device
  created_at timestamptz default now()
);

-- ══════════════════════════════════════════
-- 4. EXAMPLE PRODUCT TABLE
--    Every table in your app should follow this pattern:
--    include org_id + RLS policy
-- ══════════════════════════════════════════
create table projects (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  name text not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- ══════════════════════════════════════════
-- 5. ROW LEVEL SECURITY
-- ══════════════════════════════════════════

-- profiles: users see only their own
alter table profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- fcm_tokens: users manage only their own
alter table fcm_tokens enable row level security;

create policy "Users manage own FCM tokens"
  on fcm_tokens for all using (user_id = auth.uid());

-- projects: users see only their org's data
alter table projects enable row level security;

create policy "Org isolation on projects"
  on projects for all
  using (
    org_id = (select org_id from profiles where id = auth.uid())
  );

-- ══════════════════════════════════════════
-- 6. INVITE FLOW (optional but recommended)
--    Allows org owners to invite team members
-- ══════════════════════════════════════════
create table org_invites (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  email text not null,
  role text default 'member',
  token text unique default gen_random_uuid()::text,
  accepted_at timestamptz,
  created_at timestamptz default now()
);

-- ══════════════════════════════════════════
-- 7. HELPER: Create an org and assign owner
--    Call this after a user signs up (from your Node.js server)
-- ══════════════════════════════════════════
create or replace function create_org_for_user(
  p_user_id uuid,
  p_org_name text,
  p_org_slug text
)
returns uuid as $$
declare
  v_org_id uuid;
  v_email text;
begin
  select email into v_email from auth.users where id = p_user_id;

  insert into profiles (id, email)
  values (p_user_id, v_email)
  on conflict (id) do update
    set email = coalesce(excluded.email, profiles.email);

  insert into organizations (name, slug)
  values (p_org_name, p_org_slug)
  returning id into v_org_id;

  update profiles
  set org_id = v_org_id, role = 'owner'
  where id = p_user_id;

  return v_org_id;
end;
$$ language plpgsql security definer;

-- ══════════════════════════════════════════
-- 8. AFTER SETUP: Make yourself admin
-- ══════════════════════════════════════════
-- Step 1: Sign up via your app
-- Step 2: Create an org manually:
--   select create_org_for_user('<your-user-id>', 'My Company', 'my-company');
-- Step 3: Make yourself platform admin in profiles:
--   update profiles set role = 'admin' where email = 'you@example.com';

-- ══════════════════════════════════════════
-- 9. PLANTS & WORK ORDERS (Dashboard)
--    Safe to re-run: uses IF NOT EXISTS / OR REPLACE
-- ══════════════════════════════════════════
create table if not exists plants (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists work_orders (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  plant_id uuid references plants(id) on delete set null,
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
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table plants enable row level security;
alter table work_orders enable row level security;

drop policy if exists "Org isolation on plants" on plants;
create policy "Org isolation on plants"
  on plants for all
  using (org_id = (select org_id from profiles where id = auth.uid()));

drop policy if exists "Org isolation on work_orders" on work_orders;
create policy "Org isolation on work_orders"
  on work_orders for all
  using (org_id = (select org_id from profiles where id = auth.uid()));

-- Demo seed for an org (run after create_org_for_user)
-- Skips if plants already exist for that org
create or replace function seed_dashboard_demo(p_org_id uuid)
returns void as $$
declare
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid;
begin
  if exists (select 1 from plants where org_id = p_org_id limit 1) then
    return;
  end if;

  insert into plants (org_id, name) values (p_org_id, 'Plant 1') returning id into p1;
  insert into plants (org_id, name) values (p_org_id, 'Plant 2') returning id into p2;
  insert into plants (org_id, name) values (p_org_id, 'Plant 3') returning id into p3;
  insert into plants (org_id, name) values (p_org_id, 'Plant 4') returning id into p4;
  insert into plants (org_id, name) values (p_org_id, 'Plant 5') returning id into p5;

  insert into work_orders (org_id, plant_id, work_order_number, title, status, priority, scheduled_at, created_at) values
    (p_org_id, p1, 'WO-1265', 'Motor overheating issue', 'open', 'high', now() + interval '2 days', now() - interval '2 hours'),
    (p_org_id, p2, 'WO-1264', 'Conveyor belt alignment', 'in_progress', 'medium', now() + interval '1 day', now() - interval '5 hours'),
    (p_org_id, p3, 'WO-1263', 'Hydraulic leak repair', 'scheduled', 'high', now() + interval '3 days', now() - interval '1 day'),
    (p_org_id, p4, 'WO-1262', 'Filter replacement', 'completed', 'low', now() - interval '1 day', now() - interval '2 days'),
    (p_org_id, p5, 'WO-1261', 'Pump vibration check', 'overdue', 'medium', now() - interval '2 days', now() - interval '4 days');
end;
$$ language plpgsql security definer;
