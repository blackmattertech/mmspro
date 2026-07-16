import { apiFetch } from './api'

export function getEquipmentList(params = {}) {
  const qs = new URLSearchParams()
  if (params.locationId) qs.set('location_id', params.locationId)
  if (params.departmentId) qs.set('department_id', params.departmentId)
  if (params.areaId) qs.set('area_id', params.areaId)
  if (params.search) qs.set('search', params.search)
  const suffix = qs.toString() ? `?${qs}` : ''
  return apiFetch(`/api/equipment${suffix}`)
}

export function getEquipment(id) {
  return apiFetch(`/api/equipment/${id}`)
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

export function getEquipmentFields() {
  return apiFetch('/api/equipment-fields')
}

export function updateEquipmentFieldDropdown(id, dropdown_options) {
  return apiFetch(`/api/equipment-fields/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ dropdown_options }),
  })
}
