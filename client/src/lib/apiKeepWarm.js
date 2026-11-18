/**
 * Hobby Vercel can't run sub-daily crons. While a user has the app open,
 * lightly ping /health so the API Function stays warm for navigation.
 */
const INTERVAL_MS = 2 * 60 * 1000

function apiOrigin() {
  const configured = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '')
  if (configured) return configured
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

export function startApiKeepWarm() {
  if (typeof window === 'undefined') return () => {}
  const origin = apiOrigin()
  if (!origin) return () => {}

  let timer = null
  const ping = () => {
    if (document.visibilityState === 'hidden') return
    fetch(`${origin}/health`, { method: 'GET', cache: 'no-store' }).catch(() => {})
  }

  const arm = () => {
    if (timer) return
    ping()
    timer = window.setInterval(ping, INTERVAL_MS)
  }

  const disarm = () => {
    if (!timer) return
    window.clearInterval(timer)
    timer = null
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') arm()
    else disarm()
  }

  document.addEventListener('visibilitychange', onVisibility)
  arm()

  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    disarm()
  }
}
