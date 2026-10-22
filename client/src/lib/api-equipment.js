import { apiFetch } from './api'
import { listQueryParams, asListArray } from './listResponse'

export function getEquipmentCatalog({ departmentId, locationId, search, limit = 200 } = {}) {
  const qs = new URLSearchParams()
  if (departmentId) qs.set('department_id', departmentId)
  if (locationId) qs.set('location_id', locationId)
  if (search) qs.set('search', search)
  if (limit) qs.set('limit', String(limit))
  return apiFetch(`/api/equipment/catalog?${qs}`)
}

export async function getEquipmentList(params = {}) {
  const data = await apiFetch(`/api/equipment${listQueryParams({
    location_id: params.locationId,
    department_id: params.departmentId,
    area_id: params.areaId,
    search: params.search,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
    filters: params.filters,
    sort_by: params.sortBy,
  })}`)
  return asListArray(data)
}

export function getEquipment(id) {
  return apiFetch(`/api/equipment/${id}`)
}

export function lookupEquipment(code) {
  return apiFetch(`/api/equipment/lookup?code=${encodeURIComponent(code)}`)
}

export function createEquipment(data) {
  return apiFetch('/api/equipment', { method: 'POST', body: JSON.stringify(data) })
}

export function updateEquipment(id, data) {
  return apiFetch(`/api/equipment/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteEquipment(id) {
  return apiFetch(`/api/equipment/${id}`, { method: 'DELETE' })
}

export function getEquipmentTemplate() {
  return apiFetch('/api/equipment/template')
}

export function bulkUploadEquipment(base64Data) {
  return apiFetch('/api/equipment/bulk', {
    method: 'POST',
    body: JSON.stringify({ data: base64Data }),
  })
}

export function getEquipmentFields() {
  return apiFetch('/api/equipment-fields')
}

export function updateEquipmentFieldDropdown(id, dropdown_options) {
  return apiFetch(`/api/equipment-fields/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ dropdown_options }),
  })
}
