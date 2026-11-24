import { supabaseAdmin } from '../services/supabase.js'
import { getTaskActorContext, filterVisibleTaskIds } from './taskVisibility.js'

/**
 * Tasks created as follow-ups from a work order ("Add followup" on the work order).
 * Those tasks store a `work_order` row in `task_references`. Only tasks the viewer
 * can already see are returned, matching the Tasks & Follow-ups visibility rules.
 */
export async function listWorkOrderFollowUpTasks(orgId, profileId, workOrderId) {
  const { data: refs, error: refsError } = await supabaseAdmin
    .from('task_references')
    .select('task_id')
    .eq('org_id', orgId)
    .eq('reference_type', 'work_order')
    .eq('reference_entity_id', workOrderId)

  if (refsError) throw refsError

  const taskIds = [...new Set((refs || []).map((row) => row.task_id).filter(Boolean))]
  if (!taskIds.length) return []

  const { data: tasks, error: tasksError } = await supabaseAdmin
    .from('tasks')
    .select(`
      id, org_id, task_number, title, short_description, visibility_type,
      status_id, priority_id, due_date, created_at,
      department_id, location_id, created_by_profile_id,
      status:status_id (id, name, color, is_terminal),
      priority:priority_id (id, name, color)
    `)
    .eq('org_id', orgId)
    .in('id', taskIds)
    .order('created_at', { ascending: false })

  if (tasksError) throw tasksError

  const actor = await getTaskActorContext(orgId, profileId)
  const visible = await filterVisibleTaskIds(orgId, tasks || [], actor)

  return visible.map((task) => ({
    id: task.id,
    task_number: task.task_number || null,
    title: task.title || null,
    short_description: task.short_description || null,
    status: task.status || null,
    priority: task.priority || null,
    due_date: task.due_date || null,
    created_at: task.created_at || null,
  }))
}
