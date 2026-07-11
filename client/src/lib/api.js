import { supabase } from './supabase'

function resolveApiUrl() {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL

  // Dev: same-origin requests go through Vite proxy (no CORS, works on LAN IP too)
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    return window.location.origin
  }

  if (typeof window !== 'undefined') {
    console.error(
      '[MMSPro] VITE_API_URL is not set. API calls will fail in production. ' +
      'Set VITE_API_URL to your deployed server URL in Vercel environment variables and rebuild.'
    )
    const { protocol, hostname } = window.location
    return `${protocol}//${hostname}:5050`
  }

  return 'http://localhost:5050'
}

const API_URL = resolveApiUrl()
let cachedAccessToken = null
let cachedTokenExpiresAt = 0

export function syncAccessToken(session) {
  cachedAccessToken = session?.access_token || null
  cachedTokenExpiresAt = session?.expires_at || 0
}

export function clearAccessTokenCache() {
  cachedAccessToken = null
  cachedTokenExpiresAt = 0
}

async function getAccessToken({ forceRefresh = false } = {}) {
  if (forceRefresh) clearAccessTokenCache()

  const now = Math.floor(Date.now() / 1000)
  if (cachedAccessToken && cachedTokenExpiresAt - now > 30) {
    return cachedAccessToken
  }
  const session = supabase ? (await supabase.auth.getSession()).data.session : null
  syncAccessToken(session)
  return cachedAccessToken
}

export async function apiFetch(path, options = {}) {
  const { _retried, ...fetchOptions } = options
  const token = await getAccessToken({ forceRefresh: Boolean(_retried) })

  const res = await fetch(`${API_URL}${path}`, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...fetchOptions.headers,
    },
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = data.error || `Request failed (${res.status})`
    // Stale module-level token after logout/login — refresh once from session.
    if (res.status === 401 && !_retried && token) {
      clearAccessTokenCache()
      return apiFetch(path, { ...fetchOptions, _retried: true })
    }
    throw new Error(message)
  }
  return data
}

export function requestPasswordReset(email) {
  return apiFetch('/api/auth/password-reset', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function companyFetch(path, options = {}) {
  return apiFetch(`/api/company${path}`, options)
}

export function geocodeAddress(query) {
  return companyFetch(`/geocode?q=${encodeURIComponent(query)}`)
}

export function getCompanyDetails() {
  return companyFetch('')
}

export function updateCompanyDetails(data) {
  return companyFetch('', { method: 'PATCH', body: JSON.stringify(data) })
}

export function getLocations({ forAssignment = false } = {}) {
  const qs = forAssignment ? '?for_assignment=1' : ''
  return companyFetch(`/locations${qs}`)
}

export function createLocation(data) {
  return companyFetch('/locations', { method: 'POST', body: JSON.stringify(data) })
}

export function updateLocation(id, data) {
  return companyFetch(`/locations/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteLocation(id) {
  return companyFetch(`/locations/${id}`, { method: 'DELETE' })
}

export function getDepartments(locationId) {
  const qs = locationId ? `?location_id=${locationId}` : ''
  return companyFetch(`/departments${qs}`)
}

export function createDepartment(data) {
  return companyFetch('/departments', { method: 'POST', body: JSON.stringify(data) })
}

export function updateDepartment(id, data) {
  return companyFetch(`/departments/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteDepartment(id) {
  return companyFetch(`/departments/${id}`, { method: 'DELETE' })
}

export function getDesignations(departmentId) {
  const qs = departmentId ? `?department_id=${departmentId}` : ''
  return companyFetch(`/designations${qs}`)
}

export function createDesignation(data) {
  return companyFetch('/designations', { method: 'POST', body: JSON.stringify(data) })
}

export function updateDesignation(id, data) {
  return companyFetch(`/designations/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function reorderDesignations(ids) {
  return companyFetch('/designations/reorder', { method: 'PUT', body: JSON.stringify({ ids }) })
}

export function deleteDesignation(id) {
  return companyFetch(`/designations/${id}`, { method: 'DELETE' })
}

export function adminFetch(path, options = {}) {
  return apiFetch(`/admin-api${path}`, options)
}

export function getAdminStats() {
  return adminFetch('/stats')
}

export function getOrganizations({ limit = 50, offset = 0 } = {}) {
  return adminFetch(`/organizations?limit=${limit}&offset=${offset}`)
}

export function createOrganization(data) {
  return adminFetch('/organizations', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateOrganization(id, data) {
  return adminFetch(`/organizations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function getAdminUsers({ limit = 50, offset = 0 } = {}) {
  return adminFetch(`/users?limit=${limit}&offset=${offset}`)
}
