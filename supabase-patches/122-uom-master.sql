-- QUERY NAME: 122-uom-master — Unit of measure master
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 121-wr-location-scope-and-indexes.sql
-- Org units of measure used wherever a quantity is recorded.
-- ══════════════════════════════════════════════════════════════

create table if not exists public.org_uoms (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references public.organizations(id) on delete cascade not null,
  code text not null,
  name text not null,
  is_active boolean default true not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint org_uoms_code_len check (char_length(btrim(code)) between 1 and 40),
  constraint org_uoms_name_len check (char_length(btrim(name)) between 1 and 100)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'org_uoms_org_code_key'
      and conrelid = 'public.org_uoms'::regclass
  ) then
    alter table public.org_uoms
      add constraint org_uoms_org_code_key unique (org_id, code);
  end if;
end $$;

create index if not exists idx_org_uoms_org_active_code
  on public.org_uoms (org_id, is_active, code);

alter table public.org_uoms enable row level security;

drop policy if exists "Org members read uoms" on public.org_uoms;
create policy "Org members read uoms"
  on public.org_uoms for select
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members insert uoms" on public.org_uoms;
create policy "Org members insert uoms"
  on public.org_uoms for insert
  with check (org_id = public.current_user_org_id());

drop policy if exists "Org members update uoms" on public.org_uoms;
create policy "Org members update uoms"
  on public.org_uoms for update
  using (org_id = public.current_user_org_id());

drop policy if exists "Org members delete uoms" on public.org_uoms;
create policy "Org members delete uoms"
  on public.org_uoms for delete
  using (org_id = public.current_user_org_id());

create or replace function public.seed_default_org_uoms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.org_uoms (org_id, code, name)
  values
    (new.id, 'NOS', 'Numbers'),
    (new.id, 'PCS', 'Pieces'),
    (new.id, 'SET', 'Set'),
    (new.id, 'PAIR', 'Pair'),
    (new.id, 'KG', 'Kilogram'),
    (new.id, 'GM', 'Gram'),
    (new.id, 'LTR', 'Litre'),
    (new.id, 'ML', 'Millilitre'),
    (new.id, 'MTR', 'Metre'),
    (new.id, 'CM', 'Centimetre'),
    (new.id, 'MM', 'Millimetre'),
    (new.id, 'SQM', 'Square metre'),
    (new.id, 'CUM', 'Cubic metre'),
    (new.id, 'ROLL', 'Roll'),
    (new.id, 'BOX', 'Box'),
    (new.id, 'PKT', 'Packet'),
    (new.id, 'HR', 'Hour'),
    (new.id, 'DAY', 'Day')
  on conflict (org_id, code) do nothing;
  return new;
end;
$$;

drop trigger if exists seed_default_org_uoms on public.organizations;
create trigger seed_default_org_uoms
  after insert on public.organizations
  for each row
  execute function public.seed_default_org_uoms();

insert into public.org_uoms (org_id, code, name)
select o.id, v.code, v.name
from public.organizations o
cross join (
  values
    ('NOS', 'Numbers'),
    ('PCS', 'Pieces'),
    ('SET', 'Set'),
    ('PAIR', 'Pair'),
    ('KG', 'Kilogram'),
    ('GM', 'Gram'),
    ('LTR', 'Litre'),
    ('ML', 'Millilitre'),
    ('MTR', 'Metre'),
    ('CM', 'Centimetre'),
    ('MM', 'Millimetre'),
    ('SQM', 'Square metre'),
    ('CUM', 'Cubic metre'),
    ('ROLL', 'Roll'),
    ('BOX', 'Box'),
    ('PKT', 'Packet'),
    ('HR', 'Hour'),
    ('DAY', 'Day')
) as v(code, name)
where not exists (
  select 1
  from public.org_uoms u
  where u.org_id = o.id
    and u.code = v.code
);

insert into public.org_access_role_permissions (
  role_id, module_key, can_create, can_read, can_update, can_delete
)
select
  p.role_id,
  'uoms',
  p.can_create,
  p.can_read,
  p.can_update,
  p.can_delete
from public.org_access_role_permissions p
where p.module_key = 'work_centers'
  and p.can_read = true
  and not exists (
    select 1
    from public.org_access_role_permissions x
    where x.role_id = p.role_id
      and x.module_key = 'uoms'
  );

insert into public.org_access_role_permissions (
  role_id, module_key, can_create, can_read, can_update, can_delete
)
select
  p.role_id,
  'uoms',
  true,
  true,
  true,
  true
from public.org_access_role_permissions p
where p.module_key = 'company'
  and p.can_update = true
  and not exists (
    select 1
    from public.org_access_role_permissions x
    where x.role_id = p.role_id
      and x.module_key = 'uoms'
  );
