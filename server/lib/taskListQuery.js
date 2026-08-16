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

/**
 * Apply visibility as OR filters on the tasks query instead of loading every
 * matching id and passing a giant `.in()` list.
 */
export async function applyTaskVisibilityFilter(query, orgId, actor, tab) {
  if (tab === 'assigned_by_me') {
    return { query: query.eq('created_by_profile_id', actor.profileId), empty: false }
  }

  const parts = []
  if (actor?.profileId) {
    parts.push(`created_by_profile_id.eq.${actor.profileId}`)
  }
  if (actor?.departmentId) {
    parts.push(`and(visibility_type.eq.department,department_id.eq.${actor.departmentId})`)
  }
  if (actor?.locationId) {
    parts.push(`and(visibility_type.eq.location,location_id.eq.${actor.locationId})`)
  }

  const assigneeIds = await assigneeTaskIdsForEmployee(orgId, actor?.employeeId)
  if (assigneeIds.length) {
    parts.push(`id.in.(${assigneeIds.join(',')})`)
  }

  if (!parts.length) {
    return { query, empty: true }
  }

  return { query: query.or(parts.join(',')), empty: false }
}
