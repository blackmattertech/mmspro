import { apiFetch } from './api'

export function assetsFetch(path, options = {}) {
  return apiFetch(`/api/assets${path}`, options)
}

export function getAssetFields() {
  return assetsFetch('/fields')
}

export function createAssetField(data) {
  return assetsFetch('/fields', { method: 'POST', body: JSON.stringify(data) })
}

export function updateAssetField(id, data) {
  return assetsFetch(`/fields/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteAssetField(id) {
  return assetsFetch(`/fields/${id}`, { method: 'DELETE' })
}

export function reorderAssetSections(ids) {
  return assetsFetch('/fields/reorder', {
    method: 'PUT',
    body: JSON.stringify({ kind: 'section', ids }),
  })
}

export function getAssetFieldsTemplate(kind) {
  return assetsFetch(`/fields/template/${kind}`)
}

export function bulkUploadAssetFields(kind, base64Data) {
  return assetsFetch(`/fields/bulk/${kind}`, {
    method: 'POST',
    body: JSON.stringify({ data: base64Data }),
  })
}
