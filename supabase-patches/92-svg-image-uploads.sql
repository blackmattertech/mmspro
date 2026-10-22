-- QUERY NAME: 92-svg-image-uploads — Allow SVG on image storage buckets
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 91-organization-plan-names.sql
-- Logos, avatars, equipment photos, and work order images can be SVG.
-- ══════════════════════════════════════════════════════════════

update storage.buckets
set allowed_mime_types = allowed_mime_types || array['image/svg+xml']::text[]
where id in ('org-assets', 'user-assets', 'work-order-assets')
  and (
    allowed_mime_types is null
    or not (allowed_mime_types @> array['image/svg+xml']::text[])
  );
