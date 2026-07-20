import { useState, useEffect, createContext, useContext, useMemo, useCallback, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { syncAccessToken, clearAccessTokenCache, clearCompanyDetailsCache } from '../lib/api'
import { clearOrgCache } from '../lib/orgCache'

const AuthContext = createContext(null)

const AUTH_UNAVAILABLE = {
  error: {
    message: 'Authentication is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable sign in.',
  },
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const userIdRef = useRef(null)

  const fetchRole = useCallback(async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()
    setRole(data?.role ?? 'user')
    setLoading(false)
  }, [])

  const clearSessionState = useCallback(() => {
    userIdRef.current = null
    clearAccessTokenCache()
    clearCompanyDetailsCache()
    clearOrgCache()
    setUser(null)
    setRole(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      return
    }

    const applyAuthUser = (session) => {
      syncAccessToken(session)
      const nextUser = session?.user ?? null
      const nextId = nextUser?.id ?? null

      // Token refresh / tab focus re-emits the same user as a new object.
      // Keep the previous reference so OrgProvider and open forms stay mounted.
      if (nextId === userIdRef.current) {
        return
      }

      userIdRef.current = nextId
      setUser(nextUser)
      if (nextUser) fetchRole(nextUser.id)
      else clearSessionState()
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      applyAuthUser(session)
      if (!session?.user) setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applyAuthUser(session)
    })

    return () => subscription.unsubscribe()
  }, [fetchRole, clearSessionState])

  const applySession = useCallback(async (session) => {
    syncAccessToken(session)
    const nextUser = session?.user ?? null
    userIdRef.current = nextUser?.id ?? null
    setUser(nextUser)
    if (nextUser) {
      setLoading(true)
      await fetchRole(nextUser.id)
    } else {
      clearOrgCache()
      clearCompanyDetailsCache()
      setRole(null)
      setLoading(false)
    }
  }, [fetchRole])

  const signIn = useCallback(async (email, password) => {
    if (!isSupabaseConfigured || !supabase) return AUTH_UNAVAILABLE
    clearAccessTokenCache()
    clearCompanyDetailsCache()
    clearOrgCache()
    const result = await supabase.auth.signInWithPassword({ email, password })
    if (result.data?.session) await applySession(result.data.session)
    return result
  }, [applySession])

  const signUp = useCallback(async (email, password) => {
    if (!isSupabaseConfigured || !supabase) return AUTH_UNAVAILABLE
    clearAccessTokenCache()
    clearCompanyDetailsCache()
    clearOrgCache()
    const result = await supabase.auth.signUp({ email, password })
    if (result.data?.session) await applySession(result.data.session)
    return result
  }, [applySession])

  const signOut = useCallback(async () => {
    clearAccessTokenCache()
    clearCompanyDetailsCache()
    clearOrgCache()
    if (!isSupabaseConfigured || !supabase) {
      userIdRef.current = null
      setUser(null)
      setRole(null)
      return { error: null }
    }
    const result = await supabase.auth.signOut()
    await applySession(null)
    return result
  }, [applySession])

  const value = useMemo(
    () => ({ user, role, loading, isSupabaseConfigured, signIn, signUp, signOut }),
    [user, role, loading, signIn, signUp, signOut],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
