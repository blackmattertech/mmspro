import { apiFetch } from './api'

export function getWarrantiesList(params = {}) {
  const qs = new URLSearchParams()
  if (params.search) qs.set('search', params.search)
  const suffix = qs.toString() ? `?${qs}` : ''
  return apiFetch(`/api/warranties${suffix}`)
}

export function getWarranty(id) {
  return apiFetch(`/api/warranties/${id}`)
}

export function createWarranty(data) {
  return apiFetch('/api/warranties', { method: 'POST', body: JSON.stringify(data) })
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

export function updateWarrantyDocumentLabel(warrantyId, documentId, label) {
  return apiFetch(`/api/warranties/${warrantyId}/documents/${documentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ label }),
  })
}

export function deleteWarrantyDocument(warrantyId, documentId) {
  return apiFetch(`/api/warranties/${warrantyId}/documents/${documentId}`, {
    method: 'DELETE',
  })
}
