import { apiFetchBlob, companyFetch } from './api'
import { listQueryParams, asListArray } from './listResponse'

export async function getEmployees(filters = {}) {
  const data = await companyFetch(`/employees${listQueryParams({
    department_id: filters.departmentId,
    location_id: filters.locationId,
    for_assignment: filters.forAssignment ? '1' : undefined,
    search: filters.search,
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0,
    filters: filters.filters,
    sort: filters.sort,
    sortDir: filters.sortDir,
    sort_by: filters.sortBy,
  })}`)
  return asListArray(data)
}

export function exportEmployees(filters = {}) {
  return apiFetchBlob(`/api/company/employees${listQueryParams({
    department_id: filters.departmentId,
    location_id: filters.locationId,
    search: filters.search,
    filters: filters.filters,
    sort: filters.sort,
    sortDir: filters.sortDir,
    sort_by: filters.sortBy,
    exportCsv: true,
  })}`)
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
