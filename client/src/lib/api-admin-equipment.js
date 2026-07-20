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

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export async function uploadAdminEquipmentSectionIcon(orgId, fieldId, file) {
  const data = await fileToBase64(file)
  return adminFetch(path(orgId, `/${fieldId}/icon`), {
    method: 'POST',
    body: JSON.stringify({ contentType: file.type, data }),
  })
}

export function deleteAdminEquipmentSectionIcon(orgId, fieldId) {
  return adminFetch(path(orgId, `/${fieldId}/icon`), { method: 'DELETE' })
}

export function reorderAdminEquipmentSections(orgId, ids) {
  return adminFetch(path(orgId, '/reorder'), {
    method: 'PUT',
    body: JSON.stringify({ kind: 'section', ids }),
  })
}

export function reorderAdminEquipmentParents(orgId, sectionId, ids) {
  return adminFetch(path(orgId, '/reorder'), {
    method: 'PUT',
    body: JSON.stringify({ kind: 'parent', section_id: sectionId, ids }),
  })
}
