-- QUERY NAME: 01-fix-profiles — Backfill profiles and fix create_org_for_user
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after older supabase.sql installs
-- Fixes: missing profiles rows + updated create_org_for_user
-- ══════════════════════════════════════════════════════════════

-- 1. Backfill profiles for existing auth users
insert into profiles (id, email)
select id, email from auth.users
on conflict (id) do update
  set email = coalesce(excluded.email, profiles.email);

-- 2. Replace create_org_for_user to auto-create profile
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

-- 3. Optional: remove orphaned orgs from failed onboarding attempts
-- delete from organizations where id not in (select org_id from profiles where org_id is not null);
