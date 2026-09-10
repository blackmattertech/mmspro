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
 * Apply assigned-to-me / assigned-by-me visibility on an existing tasks query.
 * Uses OR filters (and assignee id.in for team assignments) so callers can
 * still paginate with .range() — never materializes every visible task id.
 */
export async function applyTaskVisibilityFilter(query, orgId, actor, tab) {
  if (tab === 'assigned_by_me') {
    if (!actor?.profileId) return { query, empty: true }
    return {
      query: query.eq('created_by_profile_id', actor.profileId).neq('visibility_type', 'self'),
      empty: false,
    }
  }

  const parts = []
  if (actor?.profileId) {
    parts.push(`and(visibility_type.eq.self,created_by_profile_id.eq.${actor.profileId})`)
  }
  if (actor?.departmentId && actor?.profileId) {
    parts.push(
      `and(visibility_type.eq.department,department_id.eq.${actor.departmentId},created_by_profile_id.neq.${actor.profileId})`,
    )
  }
  if (actor?.locationId && actor?.profileId) {
    parts.push(
      `and(visibility_type.eq.location,location_id.eq.${actor.locationId},created_by_profile_id.neq.${actor.profileId})`,
    )
  }

  if (actor?.employeeId && actor?.profileId) {
    const assignedIds = await assigneeTaskIdsForEmployee(orgId, actor.employeeId)
    if (assignedIds.length) {
      // Chunk large assignee sets to stay under PostgREST URL limits
      const chunkSize = 150
      for (let i = 0; i < assignedIds.length; i += chunkSize) {
        const chunk = assignedIds.slice(i, i + chunkSize)
        parts.push(
          `and(id.in.(${chunk.join(',')}),created_by_profile_id.neq.${actor.profileId})`,
        )
      }
    }
  }

  if (!parts.length) return { query, empty: true }
  return { query: query.or(parts.join(',')), empty: false }
}
