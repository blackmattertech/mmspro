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

export async function apiFetch(path, options = {}) {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null
  const token = session?.access_token

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  return data
}

export function onboardOrg(orgName) {
  return apiFetch('/api/auth/onboard', {
    method: 'POST',
    body: JSON.stringify({ orgName }),
  })
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

export function getLocations() {
  return companyFetch('/locations')
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

export function getOrganizations() {
  return adminFetch('/organizations')
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

export function getAdminUsers() {
  return adminFetch('/users')
}
