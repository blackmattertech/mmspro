import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

let orgCacheByUserId = new Map()

export const useOrg = () => {
  const { user } = useAuth()
  const [org, setOrg] = useState(null)
  const [orgRole, setOrgRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }

    const cached = orgCacheByUserId.get(user.id)
    if (cached) {
      setOrg(cached.org)
      setOrgRole(cached.orgRole)
      setLoading(false)
      return
    }

    const fetchOrg = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, org_id, organizations(id, name, slug, plan, is_active, logo_url)')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.organizations) {
        const orgData = profile.organizations
        const roleData = profile.role
        setOrg(orgData)
        setOrgRole(roleData)
        orgCacheByUserId.set(user.id, { org: orgData, orgRole: roleData })
      }
      setLoading(false)
    }

    fetchOrg()
  }, [user])

  return { org, orgRole, loading }
}
