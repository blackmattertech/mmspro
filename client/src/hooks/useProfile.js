import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'
import { getMyProfile } from '../lib/api-profile'

export function profileDisplayName(profile, user, employee) {
  if (profile?.full_name?.trim()) return profile.full_name.trim()
  if (employee?.name?.trim()) return employee.name.trim()
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

  const loadProfile = useCallback(async () => {
    if (!user) {
      setProfile(null)
      setEmployee(null)
      setAvatarUrl(null)
      setLoading(false)
      return
    }

    setLoading(true)

    try {
      const data = await getMyProfile()
      setProfile(data.profile)
      setEmployee(data.employee)
      setAvatarUrl(data.avatar_url || null)
    } catch (err) {
      console.warn('Failed to load profile:', err.message)
      setProfile(null)
      setEmployee(null)
      setAvatarUrl(null)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  return {
    profile,
    employee,
    avatarUrl,
    displayName: profileDisplayName(profile, user, employee),
    loading,
    refresh: loadProfile,
  }
}
