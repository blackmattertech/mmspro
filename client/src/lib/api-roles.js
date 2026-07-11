import { apiFetch } from './api'

export function getAccessModules() {
  return apiFetch('/api/roles/modules')
}

export function getRolesCapabilities() {
  return apiFetch('/api/roles/capabilities')
}

export function getMyPermissions() {
  return apiFetch('/api/roles/me')
}

export function getAccessRoles(locationId) {
  const qs = locationId ? `?location_id=${encodeURIComponent(locationId)}` : ''
  return apiFetch(`/api/roles${qs}`)
}

export function createAccessRole(data) {
  return apiFetch('/api/roles', { method: 'POST', body: JSON.stringify(data) })
}

export function updateAccessRole(id, data) {
  return apiFetch(`/api/roles/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteAccessRole(id) {
  return apiFetch(`/api/roles/${id}`, { method: 'DELETE' })
}

export function assignEmployeesToRole(id, employeeIds) {
  return apiFetch(`/api/roles/${id}/assign-employees`, {
    method: 'POST',
    body: JSON.stringify({ employee_ids: employeeIds }),
  })
}
