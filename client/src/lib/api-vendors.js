import { apiFetch } from './api'

export function getVendorsList(params = {}) {
  const qs = new URLSearchParams()
  if (params.search) qs.set('search', params.search)
  const suffix = qs.toString() ? `?${qs}` : ''
  return apiFetch(`/api/vendors${suffix}`)
}

export function getVendor(id) {
  return apiFetch(`/api/vendors/${id}`)
}

export function getNextVendorCode() {
  return apiFetch('/api/vendors/next-code')
}

export function createVendor(data) {
  return apiFetch('/api/vendors', { method: 'POST', body: JSON.stringify(data) })
}

export function updateVendor(id, data) {
  return apiFetch(`/api/vendors/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteVendor(id) {
  return apiFetch(`/api/vendors/${id}`, { method: 'DELETE' })
}

export function getVendorsTemplate() {
  return apiFetch('/api/vendors/template')
}

export function bulkUploadVendors(base64Data) {
  return apiFetch('/api/vendors/bulk', {
    method: 'POST',
    body: JSON.stringify({ data: base64Data }),
  })
}
