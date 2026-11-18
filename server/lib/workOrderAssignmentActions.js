import { hasModulePermission } from './orgPermissions.js'

/**
 * Pure helpers for Order To / location-scoped WO assignment gates.
 * Claim and technician assign require membership in the performing pool —
 * never the org-wide unclaimed shortcut.
 */

export function employeeMatchesDepartmentAssignment(employee, workOrder) {
  if (!employee?.department_id || !workOrder?.assigned_department_id) return false
  if (employee.department_id !== workOrder.assigned_department_id) return false
  if (
    workOrder.assigned_location_id
    && employee.location_id
    && workOrder.assigned_location_id !== employee.location_id
  ) {
    return false
  }
  return true
}

export function isLocationOnlyPool(employee, workOrder) {
  return Boolean(
    employee?.location_id
    && workOrder?.assigned_location_id
    && workOrder.assigned_location_id === employee.location_id
    && !workOrder.assigned_department_id,
  )
}

export function isInLocationPool(employee, workOrder) {
  return Boolean(
    workOrder?.assigned_location_id
    && employee?.location_id
    && workOrder.assigned_location_id === employee.location_id,
  )
}

export function canAssignDepartmentTechniciansRole(session) {
  return Boolean(
    session?.is_org_admin
    || session?.is_department_head
    || hasModulePermission(session, 'work_orders_approve', 'update')
    || hasModulePermission(session, 'work_request_approve', 'update'),
  )
}

/**
 * @param {object} opts
 * @param {object} opts.employee
 * @param {object} opts.detail — work order detail (assignees, assigned_* ids, status)
 * @param {object|null} opts.session — org permissions / role flags
 * @param {boolean} [opts.isLocationHead]
 */
export function resolveAssignmentActionFlags({
  employee,
  detail,
  session = null,
  isLocationHead = false,
} = {}) {
  if (!detail || !employee) {
    return {
      can_reassign_as_location_head: false,
      can_assign_department_technicians: false,
      can_claim_self: false,
      employee_id: employee?.id || null,
    }
  }

  const inDeptPool = employeeMatchesDepartmentAssignment(employee, detail)
  const locationPool = isInLocationPool(employee, detail)
  const locationOnlyPool = isLocationOnlyPool(employee, detail)
  const alreadyAssignee = (detail.assignees || []).some((a) => a.id === employee.id)

  const canClaimSelf = Boolean(
    !alreadyAssignee
    && (inDeptPool || locationOnlyPool),
  )

  // Org admin may assign technicians into the Order To department even if their
  // own employee row is not in that department.
  const canAssignDepartmentTechnicians = Boolean(
    canAssignDepartmentTechniciansRole(session)
    && (
      inDeptPool
      || (session?.is_org_admin && Boolean(detail.assigned_department_id))
    ),
  )

  return {
    can_reassign_as_location_head: Boolean(isLocationHead && locationPool),
    can_assign_department_technicians: canAssignDepartmentTechnicians,
    can_claim_self: canClaimSelf,
    employee_id: employee.id,
  }
}

/** Whether this employee may self-claim on the assignment PATCH. */
export function canClaimWorkOrderAssignment(employee, workOrder) {
  return employeeMatchesDepartmentAssignment(employee, workOrder)
    || isLocationOnlyPool(employee, workOrder)
}

/** Whether this session may assign technicians for the WO department. */
export function canPatchDepartmentTechnicianAssignment(employee, workOrder, session) {
  if (!canAssignDepartmentTechniciansRole(session)) return false
  if (employeeMatchesDepartmentAssignment(employee, workOrder)) return true
  return Boolean(session?.is_org_admin && workOrder?.assigned_department_id)
}
