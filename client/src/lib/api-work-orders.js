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

export function updateManualWorkOrderFormSettings(settings) {
  return workOrdersFetch('/manual/form-settings', {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  })
}

export function createManualWorkOrder({ status, values, assignedEmployeeIds }) {
  return workOrdersFetch('/manual', {
    method: 'POST',
    body: JSON.stringify({
      status,
      values,
      assigned_employee_ids: assignedEmployeeIds || [],
    }),
  })
}

export function updateManualWorkOrderValues(workOrderId, values) {
  return workOrdersFetch(`/manual/${workOrderId}/values`, {
    method: 'PATCH',
    body: JSON.stringify({ values }),
  })
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

export function getWorkOrderCounts() {
  return workOrdersFetch('/counts')
}
