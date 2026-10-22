-- QUERY NAME: 96-equipment-optional-placement — Equipment without built-in placement
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 95-platform-form-defaults.sql
-- The equipment form is only the parent fields a super admin creates.
-- Location, department, and area stay on the record when a flow still sends them.
-- ══════════════════════════════════════════════════════════════

alter table public.equipment alter column location_id drop not null;
alter table public.equipment alter column department_id drop not null;
alter table public.equipment alter column area_id drop not null;
