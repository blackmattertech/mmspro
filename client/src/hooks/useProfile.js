import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'
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
  const [profile, setProfile] = useState(null)
  const [employee, setEmployee] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async ({ silent = false } = {}) => {
    if (!user) {
      setProfile(null)
      setEmployee(null)
      setAvatarUrl(null)
      setLoading(false)
      return
    }

    if (!silent) setLoading(true)

    try {
      const data = await getMyProfile()
      setProfile(data.profile)
      setEmployee(data.employee)
      setAvatarUrl(data.avatar_url || null)
      writeProfileCache(user.id, {
        profile: data.profile,
        employee: data.employee,
        avatarUrl: data.avatar_url || null,
      })
    } catch (err) {
      console.warn('Failed to load profile:', err.message)
      if (!silent) {
        setProfile(null)
        setEmployee(null)
        setAvatarUrl(null)
        clearProfileCache(user.id)
      }
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      setProfile(null)
      setEmployee(null)
      setAvatarUrl(null)
      setLoading(false)
      return
    }

    const cached = readProfileCache(user.id)
    if (cached) {
      setProfile(cached.profile ?? null)
      setEmployee(cached.employee ?? null)
      setAvatarUrl(cached.avatarUrl ?? null)
      setLoading(false)
      loadProfile({ silent: true })
      return
    }

    loadProfile({ silent: false })
  }, [user, loadProfile])

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
    refresh: () => loadProfile({ silent: true }),
  }
}
