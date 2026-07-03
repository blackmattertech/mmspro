-- QUERY NAME: 15-user-profile-fields — User profile details on profiles table
-- ══════════════════════════════════════════════════════════════
-- MMS PRO patch | Safe to re-run | Apply after 14-department-location-heads.sql
-- Adds editable profile fields: full_name, avatar_url, phone
-- ══════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists full_name text,
  add column if not exists avatar_url text,
  add column if not exists phone text;
