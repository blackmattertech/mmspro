-- QUERY NAME: 127-uom-category — Optional category on units of measure
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 126-meter-reading-reset.sql
-- Free-text grouping for UOM master (e.g. Electrical Units, Weight Units).
-- ══════════════════════════════════════════════════════════════

alter table public.org_uoms
  add column if not exists category text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'org_uoms_category_len'
      and conrelid = 'public.org_uoms'::regclass
  ) then
    alter table public.org_uoms
      add constraint org_uoms_category_len
      check (category is null or char_length(btrim(category)) between 1 and 100);
  end if;
end $$;

create index if not exists idx_org_uoms_org_category
  on public.org_uoms (org_id, category)
  where category is not null;
