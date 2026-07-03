-- QUERY NAME: 05-org-email-from-owner — Set org email from owner on signup
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Updates create_org_for_user RPC
-- ══════════════════════════════════════════════════════════════

-- Set organization email from owner on signup RPC
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
