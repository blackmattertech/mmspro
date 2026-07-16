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

export function reorderAdminAssetSections(orgId, ids) {
  return adminFetch(orgAssetFieldsPath(orgId, '/reorder'), {
    method: 'PUT',
    body: JSON.stringify({ kind: 'section', ids }),
  })
}
