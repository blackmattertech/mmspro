import { adminFetch } from './api'

function orgAssetFieldsPath(orgId, suffix = '') {
  return `/organizations/${orgId}/asset-fields${suffix}`
}

export function getAdminAssetFields(orgId) {
  return adminFetch(orgAssetFieldsPath(orgId))
}

export function createAdminAssetField(orgId, data) {
  return adminFetch(orgAssetFieldsPath(orgId), {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateAdminAssetField(orgId, id, data) {
  return adminFetch(orgAssetFieldsPath(orgId, `/${id}`), {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteAdminAssetField(orgId, id) {
  return adminFetch(orgAssetFieldsPath(orgId, `/${id}`), { method: 'DELETE' })
}

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export async function uploadAdminSectionIcon(orgId, fieldId, file) {
  const data = await fileToBase64(file)
  return adminFetch(orgAssetFieldsPath(orgId, `/${fieldId}/icon`), {
    method: 'POST',
    body: JSON.stringify({ contentType: file.type, data }),
  })
}

export function deleteAdminSectionIcon(orgId, fieldId) {
  return adminFetch(orgAssetFieldsPath(orgId, `/${fieldId}/icon`), { method: 'DELETE' })
}

export function reorderAdminAssetSections(orgId, ids) {
  return adminFetch(orgAssetFieldsPath(orgId, '/reorder'), {
    method: 'PUT',
    body: JSON.stringify({ kind: 'section', ids }),
  })
}

export function reorderAdminAssetParents(orgId, sectionId, ids) {
  return adminFetch(orgAssetFieldsPath(orgId, '/reorder'), {
    method: 'PUT',
    body: JSON.stringify({ kind: 'parent', section_id: sectionId, ids }),
  })
}
