import { supabaseAdmin } from '../services/supabase.js'

/**
 * Resolve task IDs visible to the actor using parallel indexed queries
 * instead of post-pagination filtering.
 */
export async function resolveVisibleTaskIds(orgId, actor) {
  if (!actor?.profileId) return []

  const queries = [
    supabaseAdmin
      .from('tasks')
      .select('id')
      .eq('org_id', orgId)
      .eq('created_by_profile_id', actor.profileId),
  ]

  if (actor.employeeId) {
    queries.push(
      supabaseAdmin
        .from('task_assignees')
        .select('task_id, tasks!inner(id, visibility_type)')
        .eq('employee_id', actor.employeeId),
    )
  }

  if (actor.departmentId) {
    queries.push(
      supabaseAdmin
        .from('tasks')
        .select('id')
        .eq('org_id', orgId)
        .eq('is_recurrence_template', false)
        .eq('visibility_type', 'department')
        .eq('department_id', actor.departmentId),
    )
  }

  if (actor.locationId) {
    queries.push(
      supabaseAdmin
        .from('tasks')
        .select('id')
        .eq('org_id', orgId)
        .eq('is_recurrence_template', false)
        .eq('visibility_type', 'location')
        .eq('location_id', actor.locationId),
    )
  }

  const results = await Promise.all(queries)
  const ids = new Set()

  for (const result of results) {
    if (result.error) throw result.error
    for (const row of result.data || []) {
      if (row.id) {
        ids.add(row.id)
        continue
      }
      const visibilityType = row.tasks?.visibility_type
      if (row.task_id && visibilityType && visibilityType !== 'self') {
        ids.add(row.task_id)
      }
    }
  }

  return [...ids]
}

export async function resolveAssignedToMeTaskIds(orgId, actor) {
  if (!actor?.profileId) return []

  const ids = new Set()

  const { data: selfTasks, error: selfError } = await supabaseAdmin
    .from('tasks')
    .select('id')
    .eq('org_id', orgId)
    .eq('visibility_type', 'self')
    .eq('created_by_profile_id', actor.profileId)

  if (selfError) throw selfError
  for (const row of selfTasks || []) ids.add(row.id)

  if (actor.employeeId) {
    const { data: assignedRows, error: assignedError } = await supabaseAdmin
      .from('task_assignees')
      .select('task_id')
      .eq('employee_id', actor.employeeId)

    if (assignedError) throw assignedError
    for (const row of assignedRows || []) ids.add(row.task_id)
  }

  if (actor.departmentId) {
    const { data: deptRows, error: deptError } = await supabaseAdmin
      .from('tasks')
      .select('id')
      .eq('org_id', orgId)
      .eq('is_recurrence_template', false)
      .eq('visibility_type', 'department')
      .eq('department_id', actor.departmentId)

    if (deptError) throw deptError
    for (const row of deptRows || []) ids.add(row.id)
  }

  if (actor.locationId) {
    const { data: locRows, error: locError } = await supabaseAdmin
      .from('tasks')
      .select('id')
      .eq('org_id', orgId)
      .eq('is_recurrence_template', false)
      .eq('visibility_type', 'location')
      .eq('location_id', actor.locationId)

    if (locError) throw locError
    for (const row of locRows || []) ids.add(row.id)
  }

  return [...ids]
}
