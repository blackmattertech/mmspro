import { companyFetch } from './api'

export function getEmployees(filters = {}) {
  const params = new URLSearchParams()
  if (filters.departmentId) params.set('department_id', filters.departmentId)
  if (filters.locationId) params.set('location_id', filters.locationId)
  if (filters.designationId) params.set('designation_id', filters.designationId)
  const qs = params.toString() ? `?${params}` : ''
  return companyFetch(`/employees${qs}`)
}

export function createEmployee(data) {
  return companyFetch('/employees', { method: 'POST', body: JSON.stringify(data) })
}

export function updateEmployee(id, data) {
  return companyFetch(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteEmployee(id) {
  return companyFetch(`/employees/${id}`, { method: 'DELETE' })
}
