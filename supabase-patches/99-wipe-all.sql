-- ══════════════════════════════════════════════════════════════
-- MMS PRO — Full database wipe (safe to re-run)
-- Drops all app tables, functions, and the signup trigger.
-- Run auth user deletion separately (see server/scripts/wipe-all.js).
-- ══════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

DROP TABLE IF EXISTS public.work_orders CASCADE;
DROP TABLE IF EXISTS public.plants CASCADE;
DROP TABLE IF EXISTS public.org_invites CASCADE;
DROP TABLE IF EXISTS public.projects CASCADE;
DROP TABLE IF EXISTS public.fcm_tokens CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;

DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.create_org_for_user(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.seed_dashboard_demo(uuid) CASCADE;
