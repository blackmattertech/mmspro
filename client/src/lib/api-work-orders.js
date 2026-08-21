import { apiFetch } from './api'
import { asListArray, listQueryParams } from './listResponse'

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

export async function getReceivedWorkOrders({ search, limit = 50, offset = 0 } = {}) {
  const data = await workOrdersFetch(`/received${listQueryParams({ search, limit, offset })}`)
  return asListArray(data)
}

export function getReceivedWorkOrder(id) {
  return workOrdersFetch(`/received/${id}`)
}

export async function getAssignedWorkOrders({ search, limit = 50, offset = 0 } = {}) {
  const data = await workOrdersFetch(`/assigned${listQueryParams({ search, limit, offset })}`)
  return asListArray(data)
}

export function getAssignedWorkOrder(id) {
  return workOrdersFetch(`/assigned/${id}`)
}

export async function getScheduledWorkOrders({ search, limit = 50, offset = 0 } = {}) {
  const data = await workOrdersFetch(`/scheduled${listQueryParams({ search, limit, offset })}`)
  return asListArray(data)
}

export function getScheduledWorkOrder(id) {
  return workOrdersFetch(`/scheduled/${id}`)
}

export async function getManualWorkOrders({ search, limit = 50, offset = 0 } = {}) {
  const data = await workOrdersFetch(`/manual/orders${listQueryParams({ search, limit, offset })}`)
  return asListArray(data)
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

export function getWorkOrderDailyLogs(workOrderId) {
  return workOrdersFetch(`/manual/${workOrderId}/daily-logs`)
}

export function startWorkOrderDay(workOrderId, payload = {}) {
  return workOrdersFetch(`/manual/${workOrderId}/daily-logs/start-day`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateWorkOrderDailyLog(workOrderId, logId, payload) {
  return workOrdersFetch(`/manual/${workOrderId}/daily-logs/${logId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function endWorkOrderDay(workOrderId, logId, payload = {}) {
  return workOrdersFetch(`/manual/${workOrderId}/daily-logs/${logId}/end-day`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getWorkOrderCounts() {
  return workOrdersFetch('/counts')
}

const dashboardInflight = new Map()

export function getDashboardWorkOrders({ locationId, dateFrom, dateTo } = {}) {
  const params = new URLSearchParams()
  if (locationId && locationId !== 'all') params.set('location_id', locationId)
  if (dateFrom) params.set('date_from', dateFrom)
  if (dateTo) params.set('date_to', dateTo)
  const qs = params.toString()
  const key = qs || 'all'
  const existing = dashboardInflight.get(key)
  if (existing) return existing
  const request = workOrdersFetch(`/dashboard${qs ? `?${qs}` : ''}`).finally(() => {
    dashboardInflight.delete(key)
  })
  dashboardInflight.set(key, request)
  return request
}
