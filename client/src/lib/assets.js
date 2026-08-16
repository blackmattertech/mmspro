/**
 * Static app assets (images, icons, lottie) served from ImageKit when configured,
 * otherwise from local /public/Assets.
 *
 * ImageKit layout (at media library root):
 *   images/   ← client/public/Assets/images/*
 *   icons/    ← client/public/Assets/icons/*
 *   orb.lottie — served locally until uploaded to ImageKit root
 */

/** Assets not yet on ImageKit — always load from /public/Assets */
const LOCAL_ONLY_ASSETS = new Set([
  'Assets/orb.lottie',
])

function normalizeAssetPath(path) {
  const trimmed = String(path || '').trim()
  if (!trimmed) return ''
  const withoutLeadingSlash = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed
  return withoutLeadingSlash.replace(/^\/+/, '')
}

/**
 * Map local public paths to ImageKit folder layout.
 * Local: Assets/images/logo.svg → ImageKit: images/logo.svg
 */
function toImageKitPath(normalized) {
  if (normalized.startsWith('Assets/images/')) {
    return normalized.replace(/^Assets\/images\//, 'images/')
  }
  if (normalized.startsWith('Assets/icons/')) {
    return normalized.replace(/^Assets\/icons\//, 'icons/')
  }
  if (normalized.startsWith('Assets/')) {
    return normalized.replace(/^Assets\//, '')
  }
  return normalized
}

function getImageKitEndpoint() {
  const endpoint = import.meta.env.VITE_IMAGEKIT_URL_ENDPOINT?.trim()
  return endpoint ? endpoint.replace(/\/+$/, '') : ''
}

function getImageKitAssetsPath() {
  const prefix = import.meta.env.VITE_IMAGEKIT_ASSETS_PATH?.trim()
  if (!prefix) return ''
  return prefix.replace(/^\/+|\/+$/g, '')
}

export function isImageKitEnabled() {
  return Boolean(getImageKitEndpoint())
}

function encodeRemotePath(path) {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

/**
 * @param {string} path - e.g. '/Assets/images/logo.svg' or 'Assets/icons/file-outline.svg'
 * @returns {string} Full ImageKit URL or local public path
 */
export function assetUrl(path) {
  const normalized = normalizeAssetPath(path)
  if (!normalized) return ''

  const localPath = `/${normalized}`.replace(/ /g, '%20')
  if (LOCAL_ONLY_ASSETS.has(normalized)) {
    return localPath
  }

  const endpoint = getImageKitEndpoint()
  if (!endpoint) {
    return localPath
  }

  const assetsPath = getImageKitAssetsPath()
  const imageKitPath = toImageKitPath(normalized)
  const combined = assetsPath ? `${assetsPath}/${imageKitPath}` : imageKitPath
  return `${endpoint}/${encodeRemotePath(combined)}`
}

/** CSS `url("...")` wrapper for background/mask properties */
export function assetCssUrl(path) {
  const url = assetUrl(path)
  return url ? `url("${url}")` : 'none'
}

/** Inject CSS custom properties for assets referenced in stylesheets */
export function initAssetCssVars() {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  const vars = {
    '--asset-login-desktop-webp': assetCssUrl('Assets/images/logindesktop.webp'),
    '--asset-login-desktop-png': assetCssUrl('Assets/images/logindesktop.png'),
    '--asset-login-mobile-webp': assetCssUrl('Assets/images/loginmobile.webp'),
    '--asset-login-mobile-png': assetCssUrl('Assets/images/loginmobile.png'),
    '--asset-icon-users-outline': assetCssUrl('Assets/icons/users-outline.svg'),
  }

  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value)
  }
}
