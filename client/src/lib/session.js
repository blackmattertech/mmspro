import { apiFetch } from './api'

let inflight = null
let lastSession = null

export function peekSession() {
  return lastSession
}

export function clearSessionCache() {
  inflight = null
  lastSession = null
}

/** One in-flight GET /api/session so login redirect and OrgProvider share the same request. */
export function fetchSession() {
  if (!inflight) {
    inflight = apiFetch('/api/session')
      .then((data) => {
        lastSession = data
        return data
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

export function orgPathFromSession(session) {
  if (session?.role === 'super_admin') return '/admin/dashboard'
  const slug = session?.org?.slug
  if (!slug) return null
  if (session.org.is_active === false) {
    throw new Error('Your organization has been disabled. Contact support.')
  }
  return `/${slug}/dashboard`
}
