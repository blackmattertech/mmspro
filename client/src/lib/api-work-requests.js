import { apiFetch } from './api'
import { asListArray } from './listResponse'

export function workRequestsFetch(path, options = {}) {
  return apiFetch(`/api/work-requests${path}`, options)
}

export function getWorkRequestFormContext() {
  return workRequestsFetch('/form')
}

export function getWorkRequestEquipmentCatalog(departmentId, { search, limit } = {}) {
  const qs = new URLSearchParams({ department_id: departmentId })
  if (search) qs.set('search', search)
  if (limit) qs.set('limit', String(limit))
  return workRequestsFetch(`/equipment-catalog?${qs}`)
}

export function getWorkRequestEquipment(departmentId, search) {
  const qs = new URLSearchParams({ department_id: departmentId })
  if (search) qs.set('search', search)
  return workRequestsFetch(`/equipment?${qs}`)
}

export function createWorkRequest(body) {
  return workRequestsFetch('/', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function listWorkRequests(filter, { search, limit = 50, offset = 0 } = {}) {
  const qs = new URLSearchParams({ filter })
  if (search) qs.set('search', search)
  qs.set('limit', String(limit))
  qs.set('offset', String(offset))
  const data = await workRequestsFetch(`/?${qs}`)
  return asListArray(data)
}

export function getWorkRequest(id) {
  return workRequestsFetch(`/${id}`)
}

export function getWorkRequestDepartmentEmployees(id) {
  return workRequestsFetch(`/${id}/department-employees`)
}

export function approveWorkRequest(id, {
  assignedEmployeeIds,
  assignmentRemarks,
  workCenter,
  priority,
  plannedStartAt,
  plannedEndAt,
  plannedDurationHours,
}) {
  return workRequestsFetch(`/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({
      assigned_employee_ids: assignedEmployeeIds,
      assignment_remarks: assignmentRemarks,
      work_center: workCenter,
      priority,
      planned_start_at: plannedStartAt || null,
      planned_end_at: plannedEndAt || null,
      planned_duration_hours: plannedDurationHours ?? null,
    }),
  })
}

export function rejectWorkRequest(id, reason) {
  return workRequestsFetch(`/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}

export function requestWorkRequestInfo(id, message) {
  return workRequestsFetch(`/${id}/need-info`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

export function replyToWorkRequest(id, { message, attachments = [] }) {
  return workRequestsFetch(`/${id}/reply`, {
    method: 'POST',
    body: JSON.stringify({ message, attachments }),
  })
}
