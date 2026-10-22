-- QUERY NAME: 91-organization-plan-names — Store Super Admin plan names on companies
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 90-module-actions.sql
-- organizations.plan was limited to free | pro | enterprise.
-- Super Admin plans use their own names, so that check has to go.
-- ══════════════════════════════════════════════════════════════

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'organizations'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%plan%'
  loop
    execute format('alter table public.organizations drop constraint %I', constraint_name);
  end loop;
end $$;
