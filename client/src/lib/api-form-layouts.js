import { adminFetch, apiFetch } from './api'

const FORM_LAYOUT_TTL_MS = 30_000
const formLayoutCaches = new Map()

function getLayoutCache(formId) {
  const key = String(formId || '')
  if (!formLayoutCaches.has(key)) {
    formLayoutCaches.set(key, { data: null, expiresAt: 0, inflight: null })
  }
  return formLayoutCaches.get(key)
}

export function invalidateFormLayoutCache(formId) {
  if (!formId) {
    formLayoutCaches.clear()
    return
  }
  formLayoutCaches.delete(String(formId))
}

export function getAdminFormLayouts(orgId) {
  return adminFetch(`/organizations/${orgId}/form-layouts`)
}

export function getAdminFormLayout(orgId, formId) {
  return adminFetch(`/organizations/${orgId}/form-layouts/${encodeURIComponent(formId)}`)
}

export async function saveAdminFormLayout(orgId, formId, layout) {
  const data = await adminFetch(`/organizations/${orgId}/form-layouts/${encodeURIComponent(formId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout }),
  })
  invalidateFormLayoutCache(formId)
  return data
}

export function markAdminFormDefault(orgId, formId) {
  return adminFetch(`/organizations/${orgId}/form-layouts/${encodeURIComponent(formId)}/default`, {
    method: 'POST',
  })
}

export function getFormLayout(formId, { force = false } = {}) {
  if (!formId) return Promise.resolve(null)
  const cache = getLayoutCache(formId)
  const now = Date.now()

  if (!force && cache.data && cache.expiresAt > now) {
    return Promise.resolve(cache.data)
  }
  if (!force && cache.inflight) {
    return cache.inflight
  }

  const request = apiFetch(`/api/form-layouts/${encodeURIComponent(formId)}`)
    .then((data) => {
      cache.data = data
      cache.expiresAt = Date.now() + FORM_LAYOUT_TTL_MS
      cache.inflight = null
      return data
    })
    .catch((err) => {
      if (cache.inflight === request) cache.inflight = null
      throw err
    })

  cache.inflight = request
  return request
}

export function getFormFieldValues(formId, recordId) {
  return apiFetch(`/api/form-layouts/${encodeURIComponent(formId)}/values/${recordId}`)
}

export function saveFormFieldValues(formId, recordId, values) {
  return apiFetch(`/api/form-layouts/${encodeURIComponent(formId)}/values/${recordId}`, {
    method: 'PUT',
    body: JSON.stringify({ values }),
  })
}
