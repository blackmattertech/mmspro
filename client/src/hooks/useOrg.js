import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export const useOrg = () => {
  const { user } = useAuth()
  const [org, setOrg] = useState(null)
  const [orgRole, setOrgRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }

    const fetchOrg = async () => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, org_id, organizations(id, name, slug, plan, is_active, logo_url)')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.organizations) {
        setOrg(profile.organizations)
        setOrgRole(profile.role)
      }
      setLoading(false)
    }

    fetchOrg()
  }, [user])

  return { org, orgRole, loading }
}
