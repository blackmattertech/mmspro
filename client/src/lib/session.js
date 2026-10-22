import { apiFetch } from './api'

const SESSION_STORAGE_KEY = 'mmspro.session.v1'
const SESSION_TTL_MS = 5 * 60 * 1000

let inflight = null
let lastSession = null
let lastSessionUserId = null

function readStoredSession(userId) {
  if (!userId || typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.userId || parsed.userId !== userId) return null
    if (!parsed.savedAt || Date.now() - parsed.savedAt > SESSION_TTL_MS) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY)
      return null
    }
    return parsed.data || null
  } catch {
    return null
  }
}

function writeStoredSession(userId, data) {
  if (!userId || !data || typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      userId,
      savedAt: Date.now(),
      data,
    }))
  } catch {
    // ignore quota / private-mode errors
  }
}

export function peekSession(userId) {
  if (lastSession && (!userId || lastSessionUserId === userId)) return lastSession
  if (!userId) return lastSession
  const stored = readStoredSession(userId)
  if (stored) {
    lastSession = stored
    lastSessionUserId = userId
    return stored
  }
  return null
}

export function sessionIsUsable(session) {
  return Boolean(session?.org || session?.role === 'super_admin')
}

export function clearSessionCache() {
  inflight = null
  lastSession = null
  lastSessionUserId = null
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** One in-flight GET /api/session so login redirect and OrgProvider share the same request. */
export function fetchSession(userId) {
  if (!inflight) {
    inflight = apiFetch('/api/session')
      .then((data) => {
        lastSession = data
        lastSessionUserId = userId || data?.profile?.id || lastSessionUserId
        if (lastSessionUserId) writeStoredSession(lastSessionUserId, data)
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
