import { supabaseAdmin } from '../services/supabase.js'
import { notifyUsers } from '../services/notifications.js'

async function listActiveEmployees(orgId, applyFilter) {
  let query = supabaseAdmin
    .from('org_employees')
    .select('profile_id')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .not('profile_id', 'is', null)
  query = applyFilter(query)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function listTaskNotifyProfileIds(orgId, {
  visibilityType,
  assigneeEmployeeIds = [],
  departmentId = null,
  locationId = null,
  extraProfileIds = [],
  excludeProfileId = null,
} = {}) {
  let employees = []

  if (visibilityType === 'department' && departmentId) {
    employees = await listActiveEmployees(orgId, (query) => query.eq('department_id', departmentId))
  } else if (visibilityType === 'location' && locationId) {
    employees = await listActiveEmployees(orgId, (query) => query.eq('location_id', locationId))
  } else if (assigneeEmployeeIds?.length) {
    const ids = [...new Set(assigneeEmployeeIds.filter(Boolean))]
    if (ids.length) {
      employees = await listActiveEmployees(orgId, (query) => query.in('id', ids))
    }
  }

  const profileIds = new Set((extraProfileIds || []).filter(Boolean))
  for (const employee of employees) {
    if (employee.profile_id) profileIds.add(employee.profile_id)
  }
  if (excludeProfileId) profileIds.delete(excludeProfileId)
  return [...profileIds]
}

export async function notifyTaskAssigned(orgId, {
  title,
  taskId,
  visibilityType,
  assignment,
  excludeProfileId,
}) {
  const profileIds = await listTaskNotifyProfileIds(orgId, {
    visibilityType,
    assigneeEmployeeIds: assignment?.assigneeEmployeeIds,
    departmentId: assignment?.departmentId,
    locationId: assignment?.locationId,
    excludeProfileId,
  })
  if (!profileIds.length) return
  await notifyUsers(profileIds, {
    title: 'Task assigned',
    body: title,
    data: { type: 'task_assigned', task_id: taskId },
  })
}
