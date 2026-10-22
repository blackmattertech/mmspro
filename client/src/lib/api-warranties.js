import { apiFetch } from './api'
import { listQueryParams, asListArray } from './listResponse'

export async function getWarrantiesList(params = {}) {
  const data = await apiFetch(`/api/warranties${listQueryParams({
    search: params.search,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
    filters: params.filters,
    warranty_status: params.warranty_status,
    expiring_mode: params.expiring_mode,
    expiring_min_days: params.expiring_min_days,
    expiring_max_days: params.expiring_max_days,
    expiring_date_from: params.expiring_date_from,
    expiring_date_to: params.expiring_date_to,
  })}`)
  return asListArray(data)
}

export function getWarranty(id) {
  return apiFetch(`/api/warranties/${id}`)
}

export function createWarranty(data) {
  return apiFetch('/api/warranties', { method: 'POST', body: JSON.stringify(data) })
}

export function getWarrantiesTemplate() {
  return apiFetch('/api/warranties/template')
}

export function previewWarrantyImport(base64Data) {
  return apiFetch('/api/warranties/import', {
    method: 'POST',
    body: JSON.stringify({ data: base64Data, dry_run: true }),
  })
}

export function bulkUploadWarranties(base64Data) {
  return apiFetch('/api/warranties/import', {
    method: 'POST',
    body: JSON.stringify({ data: base64Data }),
  })
}

export function updateWarranty(id, data) {
  return apiFetch(`/api/warranties/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteWarranty(id) {
  return apiFetch(`/api/warranties/${id}`, { method: 'DELETE' })
}

export function uploadWarrantyDocument(warrantyId, data) {
  return apiFetch(`/api/warranties/${warrantyId}/documents`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateWarrantyDocument(warrantyId, documentId, data) {
  return apiFetch(`/api/warranties/${warrantyId}/documents/${documentId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteWarrantyDocument(warrantyId, documentId) {
  return apiFetch(`/api/warranties/${warrantyId}/documents/${documentId}`, {
    method: 'DELETE',
  })
}
