import { useState, useEffect, createContext, useContext, useMemo, useCallback, useRef } from 'react'
import { clearLocalSupabaseAuthStorage, readRememberMe, writeRememberMe, writeSavedEmail } from '../lib/authPreferences'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { syncAccessToken, clearAccessTokenCache, clearCompanyDetailsCache } from '../lib/api'
import { clearOrgCache } from '../lib/orgCache'
import { clearSessionCache } from '../lib/session'

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
  const [bootstrapEpoch, setBootstrapEpoch] = useState(0)
  const userIdRef = useRef(null)

  const setAccountRole = useCallback((nextRole) => {
    setRole(nextRole ?? null)
  }, [])

  const clearSessionState = useCallback(() => {
    userIdRef.current = null
    clearAccessTokenCache()
    clearCompanyDetailsCache()
    clearOrgCache()
    clearSessionCache()
    setUser(null)
    setRole(null)
    setLoading(false)
    setBootstrapEpoch((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      return
    }

    if (!readRememberMe()) {
      clearLocalSupabaseAuthStorage()
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
      if (nextUser) setLoading(false)
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
  }, [clearSessionState])

  const applySession = useCallback(async (session) => {
    syncAccessToken(session)
    const nextUser = session?.user ?? null
    userIdRef.current = nextUser?.id ?? null
    setUser(nextUser)
    if (nextUser) {
      setLoading(false)
      setBootstrapEpoch((value) => value + 1)
    } else {
      clearOrgCache()
      clearCompanyDetailsCache()
      clearSessionCache()
      setRole(null)
      setLoading(false)
      setBootstrapEpoch((value) => value + 1)
    }
  }, [])

  const signIn = useCallback(async (email, password, options = {}) => {
    if (!isSupabaseConfigured || !supabase) return AUTH_UNAVAILABLE
    const rememberMe = options.rememberMe !== false
    writeRememberMe(rememberMe)
    if (!rememberMe) {
      clearLocalSupabaseAuthStorage()
    }
    writeSavedEmail(email, rememberMe)

    clearAccessTokenCache()
    clearCompanyDetailsCache()
    clearOrgCache()
    clearSessionCache()
    const result = await supabase.auth.signInWithPassword({ email, password })
    if (result.data?.session) await applySession(result.data.session)
    return result
  }, [applySession])

  const signUp = useCallback(async (email, password) => {
    if (!isSupabaseConfigured || !supabase) return AUTH_UNAVAILABLE
    clearAccessTokenCache()
    clearCompanyDetailsCache()
    clearOrgCache()
    clearSessionCache()
    const result = await supabase.auth.signUp({ email, password })
    if (result.data?.session) await applySession(result.data.session)
    return result
  }, [applySession])

  const signOut = useCallback(async () => {
    clearAccessTokenCache()
    clearCompanyDetailsCache()
    clearOrgCache()
    clearSessionCache()
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
    () => ({ user, role, loading, bootstrapEpoch, isSupabaseConfigured, signIn, signUp, signOut, setAccountRole }),
    [user, role, loading, bootstrapEpoch, signIn, signUp, signOut, setAccountRole],
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
