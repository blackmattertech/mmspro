import { adminFetch } from './api'

function path(orgId, suffix = '') {
  return `/organizations/${orgId}/equipment-fields${suffix}`
}

export function getAdminEquipmentFields(orgId) {
  return adminFetch(path(orgId))
}

export function createAdminEquipmentField(orgId, data) {
  return adminFetch(path(orgId), { method: 'POST', body: JSON.stringify(data) })
}

export function updateAdminEquipmentField(orgId, id, data) {
  return adminFetch(path(orgId, `/${id}`), { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteAdminEquipmentField(orgId, id) {
  return adminFetch(path(orgId, `/${id}`), { method: 'DELETE' })
}

export function reorderAdminEquipmentSections(orgId, ids) {
  return adminFetch(path(orgId, '/reorder'), {
    method: 'PUT',
    body: JSON.stringify({ kind: 'section', ids }),
  })
}
