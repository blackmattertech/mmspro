/**
 * Pure tab-visibility rules for Work Orders.
 * All / Unassigned = Order To department (+ location-head override).
 * Assigned to Me = assignee junction.
 * Manual = source_type manual AND created_by me AND I am an assignee.
 * Order From / requester alone never grants Work Orders visibility.
 */

import { employeeMatchesDepartmentAssignment } from './workOrderAssignmentActions.js'
import { isScheduledWorkOrder, MANUAL_WO_SOURCE } from './workOrderOrigin.js'

/** Order To dept match or location head of assigned location. */
export function isInOrderToTabScope(employee, workOrder, { isLocationHead = false } = {}) {
  if (!employee || !workOrder) return false
  if (isScheduledWorkOrder(workOrder)) return false
  if (employeeMatchesDepartmentAssignment(employee, workOrder)) return true
  if (
    isLocationHead
    && employee.location_id
    && workOrder.assigned_location_id
    && workOrder.assigned_location_id === employee.location_id
  ) {
    return true
  }
  return false
}

export function appearsOnAllWorkOrdersTab(employee, workOrder, opts = {}) {
  return isInOrderToTabScope(employee, workOrder, opts)
}

export function appearsOnUnassignedTab(employee, workOrder, { isLocationHead = false, assigneeCount = 0 } = {}) {
  if (!isInOrderToTabScope(employee, workOrder, { isLocationHead })) return false
  return Number(assigneeCount) === 0
}

export function appearsOnAssignedToMeTab(employee, workOrder, { assigneeEmployeeIds = [] } = {}) {
  if (!employee?.id || !workOrder) return false
  if (isScheduledWorkOrder(workOrder)) return false
  return assigneeEmployeeIds.some((id) => id === employee.id)
}

export function appearsOnManualTab(employee, workOrder, { profileId, assigneeEmployeeIds = [] } = {}) {
  if (!employee?.id || !workOrder || !profileId) return false
  if (workOrder.source_type !== MANUAL_WO_SOURCE) return false
  if (workOrder.created_by !== profileId) return false
  return assigneeEmployeeIds.some((id) => id === employee.id)
}

/** True when the only relationship is requester/creator (Order From path) — not a WO tab grant. */
export function isRequesterOnlyRelationship(workOrder, profileId, { assigneeEmployeeIds = [], employee = null, isLocationHead = false } = {}) {
  if (!profileId || !workOrder) return false
  const isRequesterOrCreator = workOrder.created_by === profileId || workOrder.requester_id === profileId
  if (!isRequesterOrCreator) return false
  if (appearsOnAssignedToMeTab(employee, workOrder, { assigneeEmployeeIds })) return false
  if (appearsOnAllWorkOrdersTab(employee, workOrder, { isLocationHead })) return false
  if (appearsOnManualTab(employee, workOrder, { profileId, assigneeEmployeeIds })) return false
  return true
}

/** PostgREST OR filter for All / Unassigned Order To (+ location head) scope. */
export function orderToTabOrFilter(employee, { isLocationHead = false } = {}) {
  const parts = []
  if (employee?.department_id) {
    if (employee.location_id) {
      parts.push(
        `and(assigned_department_id.eq.${employee.department_id},assigned_location_id.eq.${employee.location_id})`,
        `and(assigned_department_id.eq.${employee.department_id},assigned_location_id.is.null)`,
      )
    } else {
      parts.push(`assigned_department_id.eq.${employee.department_id}`)
    }
  }
  if (isLocationHead && employee?.location_id) {
    parts.push(`assigned_location_id.eq.${employee.location_id}`)
  }
  return parts.join(',')
}
