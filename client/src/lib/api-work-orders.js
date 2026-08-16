import { apiFetch } from './api'

export function workOrdersFetch(path, options = {}) {
  return apiFetch(`/api/work-orders${path}`, options)
}

export function getManualWorkOrderForm() {
  return workOrdersFetch('/manual/form')
}

export function getManualWorkOrderFormSettings() {
  return workOrdersFetch('/manual/form-settings')
}

export function updateManualWorkOrderFormSettings(settings, { sectionIds } = {}) {
  const body = {}
  if (settings !== undefined) body.settings = settings
  if (sectionIds !== undefined) body.section_ids = sectionIds
  return workOrdersFetch('/manual/form-settings', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function createManualWorkOrder({
  status,
  values,
  assignedEmployeeIds,
  assignedDepartmentId,
  assignedLocationId,
}) {
  return workOrdersFetch('/manual', {
    method: 'POST',
    body: JSON.stringify({
      status,
      values,
      assigned_employee_ids: assignedEmployeeIds || [],
      assigned_department_id: assignedDepartmentId || null,
      assigned_location_id: assignedLocationId || null,
    }),
  })
}

export function updateManualWorkOrderValues(workOrderId, values) {
  return workOrdersFetch(`/manual/${workOrderId}/values`, {
    method: 'PATCH',
    body: JSON.stringify({ values }),
  })
}

export function updateManualWorkOrder(workOrderId, {
  status,
  values,
  assignedEmployeeIds,
  assignedDepartmentId,
  assignedLocationId,
} = {}) {
  const body = {}
  if (status !== undefined) body.status = status
  if (values !== undefined) body.values = values
  if (assignedEmployeeIds !== undefined) body.assigned_employee_ids = assignedEmployeeIds
  if (assignedDepartmentId !== undefined) body.assigned_department_id = assignedDepartmentId
  if (assignedLocationId !== undefined) body.assigned_location_id = assignedLocationId

  return workOrdersFetch(`/manual/${workOrderId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deleteManualWorkOrder(workOrderId) {
  return workOrdersFetch(`/manual/${workOrderId}`, { method: 'DELETE' })
}

export function getReceivedWorkOrders() {
  return workOrdersFetch('/received')
}

export function getReceivedWorkOrder(id) {
  return workOrdersFetch(`/received/${id}`)
}

export function getAssignedWorkOrders() {
  return workOrdersFetch('/assigned')
}

export function getAssignedWorkOrder(id) {
  return workOrdersFetch(`/assigned/${id}`)
}

export function getScheduledWorkOrders() {
  return workOrdersFetch('/scheduled')
}

export function getManualWorkOrders() {
  return workOrdersFetch('/manual/orders')
}

export function getManualWorkOrder(id) {
  return workOrdersFetch(`/manual/orders/${id}`)
}

export function updateWorkOrderAssignment(workOrderId, payload) {
  return workOrdersFetch(`/manual/${workOrderId}/assignment`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function updateWorkOrderLifecycle(workOrderId, payload) {
  return workOrdersFetch(`/manual/${workOrderId}/lifecycle`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function getWorkOrderCounts() {
  return workOrdersFetch('/counts')
}

export function getDashboardWorkOrders({ locationId, dateFrom, dateTo } = {}) {
  const params = new URLSearchParams()
  if (locationId && locationId !== 'all') params.set('location_id', locationId)
  if (dateFrom) params.set('date_from', dateFrom)
  if (dateTo) params.set('date_to', dateTo)
  const qs = params.toString()
  return workOrdersFetch(`/dashboard${qs ? `?${qs}` : ''}`)
}
