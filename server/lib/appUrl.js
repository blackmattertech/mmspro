function normalizeUrl(url) {
  return url.trim().replace(/\/$/, '')
}

/**
 * Canonical public app URL for email links and Supabase auth redirects.
 * Set APP_PUBLIC_URL to a hostname reachable from the user's device
 * (production domain, ngrok tunnel, or LAN IP — not localhost for real emails).
 */
export function getPublicAppUrl() {
  const explicit = process.env.APP_PUBLIC_URL?.trim()
  if (explicit) return normalizeUrl(explicit)

  const raw = process.env.CLIENT_URL || 'http://localhost:5173'
  return normalizeUrl(raw.split(',')[0])
}

/** Comma-separated CLIENT_URL origins plus APP_PUBLIC_URL when set. */
export function getCorsOrigins() {
  const origins = new Set()

  for (const origin of (process.env.CLIENT_URL || '').split(',')) {
    const trimmed = origin.trim()
    if (trimmed) origins.add(normalizeUrl(trimmed))
  }

  const publicUrl = process.env.APP_PUBLIC_URL?.trim()
  if (publicUrl) origins.add(normalizeUrl(publicUrl))

  return [...origins]
}
