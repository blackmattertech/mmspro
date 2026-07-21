import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth'

export const MAX_QUICK_ACCESS = 10

function storageKey(scope, userId) {
  return `mmspro:quick-access:${scope}:${userId}`
}

function readIds(scope, userId) {
  if (!scope || !userId) return []
  try {
    const key = storageKey(scope, userId)
    let raw = localStorage.getItem(key)
    if (!raw && scope.startsWith('org:')) {
      const legacyOrgId = scope.slice(4)
      const legacyKey = `mmspro:quick-access:${legacyOrgId}:${userId}`
      raw = localStorage.getItem(legacyKey)
      if (raw) {
        localStorage.setItem(key, raw)
        localStorage.removeItem(legacyKey)
      }
    }
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

function writeIds(scope, userId, ids) {
  if (!scope || !userId) return
  try {
    localStorage.setItem(storageKey(scope, userId), JSON.stringify(ids))
  } catch {
    // ignore storage errors
  }
}

/**
 * Per-user quick access pins. Scope separates org app vs platform admin (and each org).
 * @param {string | null} scope e.g. `org:<uuid>` or `admin`
 */
export function useQuickAccess(scope) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [ids, setIds] = useState(() => readIds(scope, userId))

  useEffect(() => {
    setIds(readIds(scope, userId))
  }, [scope, userId])

  const persist = useCallback((next) => {
    setIds(next)
    writeIds(scope, userId, next)
  }, [scope, userId])

  const add = useCallback((id) => {
    if (!id || !scope) return
    setIds((prev) => {
      if (prev.includes(id) || prev.length >= MAX_QUICK_ACCESS) return prev
      const next = [...prev, id]
      writeIds(scope, userId, next)
      return next
    })
  }, [scope, userId])

  const remove = useCallback((id) => {
    setIds((prev) => {
      const next = prev.filter((item) => item !== id)
      writeIds(scope, userId, next)
      return next
    })
  }, [scope, userId])

  const pruneTo = useCallback((allowedIds) => {
    const allowed = new Set(allowedIds)
    setIds((prev) => {
      const next = prev.filter((id) => allowed.has(id))
      if (next.length === prev.length) return prev
      writeIds(scope, userId, next)
      return next
    })
  }, [scope, userId])

  const clear = useCallback(() => {
    persist([])
  }, [persist])

  return {
    ids,
    add,
    remove,
    pruneTo,
    clear,
    max: MAX_QUICK_ACCESS,
    canAdd: Boolean(scope) && ids.length < MAX_QUICK_ACCESS,
  }
}

export function orgQuickAccessScope(orgId) {
  return orgId ? `org:${orgId}` : null
}

export const ADMIN_QUICK_ACCESS_SCOPE = 'admin'
