import { companyFetch } from './api'
import { listQueryParams, asListArray } from './listResponse'

export async function getEmployees(filters = {}) {
  const data = await companyFetch(`/employees${listQueryParams({
    department_id: filters.departmentId,
    location_id: filters.locationId,
    for_assignment: filters.forAssignment ? '1' : undefined,
    search: filters.search,
    limit: filters.limit ?? 200,
    offset: filters.offset ?? 0,
  })}`)
  return asListArray(data)
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
