import { useState, useEffect, createContext, useContext, useMemo, useCallback } from 'react'
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

  const fetchRole = useCallback(async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()
    setRole(data?.role ?? 'user')
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      syncAccessToken(session)
      setUser(session?.user ?? null)
      if (session?.user) fetchRole(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      syncAccessToken(session)
      setUser(session?.user ?? null)
      if (session?.user) fetchRole(session.user.id)
      else {
        clearAccessTokenCache()
        clearCompanyDetailsCache()
        clearOrgCache()
        setRole(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [fetchRole])

  const applySession = useCallback(async (session) => {
    syncAccessToken(session)
    const nextUser = session?.user ?? null
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
