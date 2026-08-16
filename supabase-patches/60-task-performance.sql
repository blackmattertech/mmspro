-- QUERY NAME: 60-task-performance — Task list/kanban performance indexes & counts RPC
-- MMS PRO patch | Safe to re-run | Apply after 59-task-spec-compliance.sql

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Self-assigned task visibility lookups
CREATE INDEX IF NOT EXISTS idx_tasks_org_self_creator
  ON public.tasks(org_id, created_by_profile_id)
  WHERE visibility_type = 'self';

-- Department / location pool lookups
CREATE INDEX IF NOT EXISTS idx_tasks_org_dept_visibility
  ON public.tasks(org_id, department_id, visibility_type)
  WHERE visibility_type = 'department' AND is_recurrence_template = false;

CREATE INDEX IF NOT EXISTS idx_tasks_org_loc_visibility
  ON public.tasks(org_id, location_id, visibility_type)
  WHERE visibility_type = 'location' AND is_recurrence_template = false;

-- Comment / attachment count aggregation
CREATE INDEX IF NOT EXISTS idx_task_comments_task_active
  ON public.task_comments(task_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_task_attachments_task
  ON public.task_attachments(task_id);

-- Task search (ilike on list filter)
CREATE INDEX IF NOT EXISTS idx_tasks_title_trgm
  ON public.tasks USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_tasks_task_number_trgm
  ON public.tasks USING gin (task_number gin_trgm_ops);

-- Batch comment + attachment counts for kanban cards
CREATE OR REPLACE FUNCTION public.task_engagement_counts(p_task_ids uuid[])
RETURNS TABLE (
  task_id uuid,
  comment_count bigint,
  attachment_count bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    input.id AS task_id,
    COALESCE((
      SELECT count(*)::bigint
      FROM public.task_comments tc
      WHERE tc.task_id = input.id
        AND tc.is_deleted = false
    ), 0) AS comment_count,
    COALESCE((
      SELECT count(*)::bigint
      FROM public.task_attachments ta
      WHERE ta.task_id = input.id
    ), 0) AS attachment_count
  FROM unnest(p_task_ids) AS input(id);
$$;
