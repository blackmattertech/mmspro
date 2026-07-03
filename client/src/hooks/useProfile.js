import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { getUserAssetSignedUrl } from '../lib/userAssets'

export function profileDisplayName(profile, user) {
  if (profile?.full_name?.trim()) return profile.full_name.trim()
  if (user?.email) return user.email.split('@')[0]
  return 'User'
}

export function useProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async () => {
    if (!user || !supabase) {
      setProfile(null)
      setAvatarUrl(null)
      setLoading(false)
      return
    }

    setLoading(true)

    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, phone, role, org_id')
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      console.warn('Failed to load profile:', error.message)
      setProfile(null)
      setAvatarUrl(null)
      setLoading(false)
      return
    }

    setProfile(data)

    if (data?.avatar_url) {
      try {
        const url = await getUserAssetSignedUrl(data.avatar_url)
        setAvatarUrl(url)
      } catch {
        setAvatarUrl(null)
      }
    } else {
      setAvatarUrl(null)
    }

    setLoading(false)
  }, [user])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  return {
    profile,
    avatarUrl,
    displayName: profileDisplayName(profile, user),
    loading,
    refresh: loadProfile,
  }
}
