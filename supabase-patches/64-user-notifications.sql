-- QUERY NAME: 64-user-notifications — In-app notification inbox
-- MMS PRO patch | Safe to re-run | Apply after 63-dashboard-stats.sql
-- Stores in-app notifications so the bell works even when the tab is closed.

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  url text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
  ON public.user_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_unread
  ON public.user_notifications(user_id)
  WHERE read_at IS NULL;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON public.user_notifications;
CREATE POLICY "Users read own notifications"
  ON public.user_notifications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications" ON public.user_notifications;
CREATE POLICY "Users update own notifications"
  ON public.user_notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, UPDATE ON TABLE public.user_notifications TO authenticated;
GRANT ALL ON TABLE public.user_notifications TO service_role;
