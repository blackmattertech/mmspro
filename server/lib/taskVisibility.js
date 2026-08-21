import { supabaseAdmin } from '../services/supabase.js'
import { getEmployeeByProfile } from './workRequestService.js'

export async function getTaskActorContext(orgId, profileId) {
  let employee = await getEmployeeByProfile(orgId, profileId)
  if (!employee) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', profileId)
      .maybeSingle()
    if (profile?.email) {
      employee = await getEmployeeByProfile(orgId, profileId, { email: profile.email })
    }
  }
  return {
    profileId,
    employeeId: employee?.id || null,
    departmentId: employee?.department_id || null,
    locationId: employee?.location_id || null,
    employee,
  }
}

export function taskVisibleToActor(task, actor, assigneeEmployeeIds = []) {
  if (!task || !actor?.profileId) return false

  if (task.created_by_profile_id === actor.profileId) return true

  switch (task.visibility_type) {
    case 'self':
      return task.created_by_profile_id === actor.profileId

    case 'team':
      return actor.employeeId && assigneeEmployeeIds.includes(actor.employeeId)

    case 'department':
      if (actor.employeeId && assigneeEmployeeIds.includes(actor.employeeId)) return true
      return Boolean(
        task.department_id
        && actor.departmentId
        && task.department_id === actor.departmentId,
      )

    case 'location':
      if (actor.employeeId && assigneeEmployeeIds.includes(actor.employeeId)) return true
      return Boolean(
        task.location_id
        && actor.locationId
        && task.location_id === actor.locationId,
      )

    default:
      return false
  }
}

export function taskAssignedToActor(task, actor, assigneeEmployeeIds = []) {
  if (!actor?.profileId) return false

  if (task.visibility_type === 'self' && task.created_by_profile_id === actor.profileId) {
    return true
  }

  if (actor.employeeId && assigneeEmployeeIds.includes(actor.employeeId)) {
    return true
  }

  if (!actor.employeeId) return false

  if (task.visibility_type === 'department' && task.department_id && actor.departmentId) {
    return task.department_id === actor.departmentId
  }

  if (task.visibility_type === 'location' && task.location_id && actor.locationId) {
    return task.location_id === actor.locationId
  }

  return false
}

export async function loadAssigneeIdsForTasks(taskIds) {
  if (!taskIds?.length) return new Map()
  const { data, error } = await supabaseAdmin
    .from('task_assignees')
    .select('task_id, employee_id')
    .in('task_id', taskIds)

  if (error) throw error

  const map = new Map()
  for (const row of data || []) {
    if (!map.has(row.task_id)) map.set(row.task_id, [])
    map.get(row.task_id).push(row.employee_id)
  }
  return map
}

export async function assertTaskVisible(orgId, taskId, actor) {
  const { data: task, error } = await supabaseAdmin
    .from('tasks')
    .select('id, org_id, visibility_type, department_id, location_id, created_by_profile_id')
    .eq('org_id', orgId)
    .eq('id', taskId)
    .maybeSingle()

  if (error) throw error
  if (!task) {
    const err = new Error('Task not found')
    err.status = 404
    throw err
  }

  const assigneeMap = await loadAssigneeIdsForTasks([taskId])
  const assigneeIds = assigneeMap.get(taskId) || []

  if (!taskVisibleToActor(task, actor, assigneeIds)) {
    const err = new Error('Task not found')
    err.status = 404
    throw err
  }

  return task
}

export async function filterVisibleTaskIds(orgId, taskRows, actor) {
  if (!taskRows?.length) return []
  const ids = taskRows.map((t) => t.id)
  const assigneeMap = await loadAssigneeIdsForTasks(ids)
  return taskRows.filter((task) => {
    const assigneeIds = assigneeMap.get(task.id) || []
    return taskVisibleToActor(task, actor, assigneeIds)
  })
}
