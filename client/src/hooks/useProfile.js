import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'
import { useOrgBootstrap } from './useOrg'
import { getMyProfile } from '../lib/api-profile'

const PROFILE_CACHE_PREFIX = 'mmspro:profile-cache:'

function cacheKey(userId) {
  return `${PROFILE_CACHE_PREFIX}${userId}`
}

function readProfileCache(userId) {
  if (!userId || typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(cacheKey(userId))
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeProfileCache(userId, payload) {
  if (!userId || typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(cacheKey(userId), JSON.stringify(payload))
  } catch {
    // ignore quota / private mode failures
  }
}

function clearProfileCache(userId) {
  if (!userId || typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(cacheKey(userId))
  } catch {
    // ignore
  }
}

export function profileDisplayName(profile, user, employee) {
  if (profile?.full_name?.trim()) return profile.full_name.trim()
  if (employee?.name?.trim()) return employee.name.trim()
  const metaName = user?.user_metadata?.full_name || user?.user_metadata?.name
  if (typeof metaName === 'string' && metaName.trim()) return metaName.trim()
  if (user?.email) return user.email.split('@')[0]
  return 'User'
}

export function profileFormName(profile, employee) {
  if (profile?.full_name?.trim()) return profile.full_name.trim()
  if (employee?.name?.trim()) return employee.name.trim()
  return ''
}

export function profileFormPhone(profile, employee) {
  if (profile?.phone?.trim()) return profile.phone.trim()
  if (employee?.mobile?.trim()) return employee.mobile.trim()
  return ''
}

export function useProfile() {
  const { user } = useAuth()
  const { me, loading: orgLoading } = useOrgBootstrap()
  const [override, setOverride] = useState(null)

  const profile = override?.profile ?? me?.profile ?? null
  const employee = override?.employee ?? me?.employee ?? null
  const avatarUrl = override?.avatarUrl ?? me?.avatarUrl ?? null
  const loading = Boolean(user) && orgLoading && !profile && !employee && !override

  const refresh = useCallback(async () => {
    if (!user) return
    try {
      const data = await getMyProfile()
      const next = {
        profile: data.profile,
        employee: data.employee,
        avatarUrl: data.avatar_url || null,
      }
      setOverride(next)
      writeProfileCache(user.id, next)
    } catch (err) {
      console.warn('Failed to load profile:', err.message)
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      setOverride(null)
      return
    }
    if (me?.profile || me?.employee) {
      writeProfileCache(user.id, {
        profile: me.profile,
        employee: me.employee,
        avatarUrl: me.avatarUrl || null,
      })
    }
  }, [user, me])

  const profileReady = Boolean(profile || employee)
  const displayName = profileReady
    ? profileDisplayName(profile, user, employee)
    : null

  return {
    profile,
    employee,
    avatarUrl,
    displayName,
    loading,
    refresh,
  }
}
