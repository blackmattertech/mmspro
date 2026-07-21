export const AUTH_REMEMBER_KEY = 'mmspro:auth-remember-me'
export const AUTH_SAVED_EMAIL_KEY = 'mmspro:auth-saved-email'

export function readRememberMe() {
  try {
    return localStorage.getItem(AUTH_REMEMBER_KEY) !== 'false'
  } catch {
    return true
  }
}

export function writeRememberMe(remember) {
  try {
    localStorage.setItem(AUTH_REMEMBER_KEY, remember ? 'true' : 'false')
  } catch {
    // ignore
  }
}

export function readSavedEmail() {
  if (!readRememberMe()) return ''
  try {
    return localStorage.getItem(AUTH_SAVED_EMAIL_KEY) || ''
  } catch {
    return ''
  }
}

export function writeSavedEmail(email, remember = readRememberMe()) {
  try {
    const trimmed = email.trim()
    if (remember && trimmed) {
      localStorage.setItem(AUTH_SAVED_EMAIL_KEY, trimmed)
    } else {
      localStorage.removeItem(AUTH_SAVED_EMAIL_KEY)
    }
  } catch {
    // ignore
  }
}

/** Remove Supabase session keys from localStorage (used when signing in without remember me). */
export function clearLocalSupabaseAuthStorage() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key && key.startsWith('sb-')) keys.push(key)
    }
    for (const key of keys) localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function createAuthStorageAdapter() {
  const primary = () => (readRememberMe() ? localStorage : sessionStorage)
  const secondary = () => (readRememberMe() ? sessionStorage : localStorage)

  return {
    getItem(key) {
      try {
        const value = primary().getItem(key)
        if (value != null) return value
        if (readRememberMe()) {
          return secondary().getItem(key)
        }
        return null
      } catch {
        return null
      }
    },
    setItem(key, value) {
      try {
        primary().setItem(key, value)
        secondary().removeItem(key)
      } catch {
        // ignore
      }
    },
    removeItem(key) {
      try {
        localStorage.removeItem(key)
        sessionStorage.removeItem(key)
      } catch {
        // ignore
      }
    },
  }
}
