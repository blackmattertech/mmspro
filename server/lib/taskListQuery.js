import { supabaseAdmin } from '../services/supabase.js'

async function assigneeTaskIdsForEmployee(orgId, employeeId) {
  if (!employeeId) return []
  const { data, error } = await supabaseAdmin
    .from('task_assignees')
    .select('task_id')
    .eq('org_id', orgId)
    .eq('employee_id', employeeId)

  if (error) throw error
  return [...new Set((data || []).map((row) => row.task_id).filter(Boolean))]
}

async function listAssignedToMeTaskIds(orgId, actor) {
  const ids = new Set()

  if (actor?.employeeId) {
    const assignedIds = await assigneeTaskIdsForEmployee(orgId, actor.employeeId)
    if (assignedIds.length) {
      const { data, error } = await supabaseAdmin
        .from('tasks')
        .select('id, created_by_profile_id')
        .eq('org_id', orgId)
        .in('id', assignedIds)
      if (error) throw error
      for (const row of data || []) {
        if (row.created_by_profile_id !== actor.profileId) ids.add(row.id)
      }
    }
  }

  const poolParts = []
  if (actor?.profileId) {
    poolParts.push(`and(visibility_type.eq.self,created_by_profile_id.eq.${actor.profileId})`)
  }
  if (actor?.departmentId) {
    poolParts.push(`and(visibility_type.eq.department,department_id.eq.${actor.departmentId})`)
  }
  if (actor?.locationId) {
    poolParts.push(`and(visibility_type.eq.location,location_id.eq.${actor.locationId})`)
  }

  if (poolParts.length) {
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .select('id, created_by_profile_id, visibility_type')
      .eq('org_id', orgId)
      .or(poolParts.join(','))
    if (error) throw error
    for (const row of data || []) {
      if (row.visibility_type !== 'self' && row.created_by_profile_id === actor.profileId) continue
      ids.add(row.id)
    }
  }

  return [...ids]
}

export async function applyTaskVisibilityFilter(query, orgId, actor, tab) {
  if (tab === 'assigned_by_me') {
    if (!actor?.profileId) return { query, empty: true }
    return {
      query: query.eq('created_by_profile_id', actor.profileId).neq('visibility_type', 'self'),
      empty: false,
    }
  }

  const ids = await listAssignedToMeTaskIds(orgId, actor)
  if (!ids.length) return { query, empty: true }
  return { query: query.in('id', ids), empty: false }
}
