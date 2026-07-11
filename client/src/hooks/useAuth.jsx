import { useState, useEffect, createContext, useContext } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { syncAccessToken, clearAccessTokenCache } from '../lib/api'

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
        setRole(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchRole = async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle()
    setRole(data?.role ?? 'user')
    setLoading(false)
  }

  const signIn = async (email, password) => {
    if (!isSupabaseConfigured || !supabase) return AUTH_UNAVAILABLE
    clearAccessTokenCache()
    const result = await supabase.auth.signInWithPassword({ email, password })
    if (result.data?.session) syncAccessToken(result.data.session)
    return result
  }

  const signUp = async (email, password) => {
    if (!isSupabaseConfigured || !supabase) return AUTH_UNAVAILABLE
    clearAccessTokenCache()
    const result = await supabase.auth.signUp({ email, password })
    if (result.data?.session) syncAccessToken(result.data.session)
    return result
  }

  const signOut = async () => {
    clearAccessTokenCache()
    if (!isSupabaseConfigured || !supabase) {
      setUser(null)
      setRole(null)
      return { error: null }
    }
    return supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, role, loading, isSupabaseConfigured, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
