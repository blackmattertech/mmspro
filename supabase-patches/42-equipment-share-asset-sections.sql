-- QUERY NAME: 42-equipment-share-asset-sections — Equipment uses asset sections
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 41-field-type-radio.sql
-- Equipment parents reference asset_fields sections. Existing equipment
-- sections are copied into asset_fields (same ids) then removed.
-- ══════════════════════════════════════════════════════════════

-- 1. Copy equipment sections into asset_fields (preserve ids so parent FKs stay valid)
insert into public.asset_fields (
  id, org_id, name, kind, section_id, parent_id, field_type,
  sort_order, is_active, icon_path, created_at, updated_at
)
select
  ef.id,
  ef.org_id,
  ef.name,
  'section',
  null,
  null,
  null,
  ef.sort_order,
  ef.is_active,
  ef.icon_path,
  ef.created_at,
  ef.updated_at
from public.equipment_fields ef
where ef.kind = 'section'
  and not exists (
    select 1 from public.asset_fields af where af.id = ef.id
  );

-- 2. Point equipment.section_id at asset_fields
alter table public.equipment_fields
  drop constraint if exists equipment_fields_section_id_fkey;

alter table public.equipment_fields
  add constraint equipment_fields_section_id_fkey
  foreign key (section_id) references public.asset_fields(id) on delete cascade;

-- 3. Remove section rows from equipment_fields (now live in asset_fields)
delete from public.equipment_fields where kind = 'section';

-- 4. Work order forms can include both asset_fields and equipment_fields parent ids.
-- A single FK cannot point at two tables, so validation is handled by the API.
alter table public.work_order_field_settings
  drop constraint if exists work_order_field_settings_field_id_fkey;

alter table public.manual_work_order_values
  drop constraint if exists manual_work_order_values_field_id_fkey;
