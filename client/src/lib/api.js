import { supabase } from './supabase'

function resolveApiUrl() {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL

  // Dev: same-origin requests go through Vite proxy (no CORS, works on LAN IP too)
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    return window.location.origin
  }

  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location
    return `${protocol}//${hostname}:5050`
  }

  return 'http://localhost:5050'
}

const API_URL = resolveApiUrl()

export async function apiFetch(path, options = {}) {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null
  const token = session?.access_token

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`)
  }
  return data
}

export function onboardOrg(orgName) {
  return apiFetch('/api/auth/onboard', {
    method: 'POST',
    body: JSON.stringify({ orgName }),
  })
}
