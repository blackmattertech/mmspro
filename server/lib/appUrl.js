function normalizeUrl(url) {
  return url.trim().replace(/\/$/, '')
}

const TUNNEL_HOST_RE =
  /(?:^|\.)(?:ngrok(?:-free)?\.(?:dev|app|io)|trycloudflare\.com|loca\.lt)$/i

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
}

export function isTunnelUrl(url) {
  try {
    return TUNNEL_HOST_RE.test(new URL(url).hostname)
  } catch {
    return false
  }
}

function clientOrigins() {
  return (process.env.CLIENT_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(normalizeUrl)
}

function firstStableClientOrigin() {
  return clientOrigins().find((origin) => {
    try {
      const { hostname } = new URL(origin)
      return hostname !== 'localhost'
        && hostname !== '127.0.0.1'
        && !isTunnelUrl(origin)
    } catch {
      return false
    }
  }) || null
}

/**
 * Canonical public app URL for email links and Supabase auth redirects.
 *
 * Dev: set APP_PUBLIC_URL to your ngrok / Cloudflare tunnel.
 * Production: set APP_PUBLIC_URL to the real client domain (e.g. https://mmspro.vercel.app).
 * Tunnel URLs are ignored in production so a leftover ngrok value cannot leak into emails.
 */
export function getPublicAppUrl() {
  const explicit = process.env.APP_PUBLIC_URL?.trim()
  if (explicit) {
    const normalized = normalizeUrl(explicit)
    if (!(isProductionRuntime() && isTunnelUrl(normalized))) {
      return normalized
    }
    console.warn(
      `Ignoring tunnel APP_PUBLIC_URL in production (${normalized}). Set APP_PUBLIC_URL to your real client domain.`
    )
  }

  if (isProductionRuntime()) {
    const stable = firstStableClientOrigin()
    if (stable) return stable
  }

  const raw = process.env.CLIENT_URL || 'http://localhost:5173'
  return normalizeUrl(raw.split(',')[0])
}

/** Password / invite emails should land on this path. */
export function getPasswordResetRedirectUrl() {
  return `${getPublicAppUrl()}/reset-password`
}

/**
 * Build a recovery URL that opens the app directly (dev ngrok or prod domain).
 * Uses hashed_token so Supabase Site URL cannot rewrite the destination.
 */
export function buildAppRecoveryUrl(generateLinkData) {
  const redirectTo = getPasswordResetRedirectUrl()
  const hashedToken = generateLinkData?.properties?.hashed_token

  if (hashedToken) {
    const url = new URL(redirectTo)
    url.searchParams.set('token_hash', hashedToken)
    url.searchParams.set('type', 'recovery')
    return url.toString()
  }

  const actionLink = generateLinkData?.properties?.action_link
  if (!actionLink) return null

  try {
    const url = new URL(actionLink)
    url.searchParams.set('redirect_to', redirectTo)
    return url.toString()
  } catch {
    return actionLink
  }
}

/** Comma-separated CLIENT_URL origins plus APP_PUBLIC_URL when set. */
export function getCorsOrigins() {
  const origins = new Set()

  for (const origin of clientOrigins()) {
    origins.add(origin)
  }

  const publicUrl = process.env.APP_PUBLIC_URL?.trim()
  if (publicUrl) origins.add(normalizeUrl(publicUrl))

  return [...origins]
}
