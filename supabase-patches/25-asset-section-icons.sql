-- QUERY NAME: 25-asset-section-icons — Custom PNG/SVG icons for asset sections
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 24-asset-field-dependencies.sql
-- Files stored in org-assets: {org_id}/section-icons/{section_id}.{ext}
-- ══════════════════════════════════════════════════════════════

alter table public.asset_fields
  add column if not exists icon_path text;

comment on column public.asset_fields.icon_path is
  'Storage path for section icon (PNG/SVG) in org-assets bucket';

-- Allow SVG uploads for section icons
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'
]::text[]
where id = 'org-assets';
