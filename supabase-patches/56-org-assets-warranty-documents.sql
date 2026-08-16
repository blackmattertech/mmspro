-- QUERY NAME: 56-org-assets-warranty-documents — Allow PDF/docs in org-assets bucket
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 55-warranty-documents.sql
-- Warranty documents, task attachments, and similar files use org-assets.
-- ══════════════════════════════════════════════════════════════

update storage.buckets
set
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]::text[],
  file_size_limit = 26214400
where id = 'org-assets';
