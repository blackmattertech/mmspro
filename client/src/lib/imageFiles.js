export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/svg+xml,.svg'

const RASTER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export function resolveImageMime(file) {
  const type = String(file?.type || '').toLowerCase()
  if (type === 'image/svg+xml') return type
  if (/\.svg$/i.test(file?.name || '') && (!type || type === 'application/octet-stream')) {
    return 'image/svg+xml'
  }
  return type
}

export function isSvgFile(file) {
  return resolveImageMime(file) === 'image/svg+xml'
}

export function isAllowedImageFile(file) {
  const type = resolveImageMime(file)
  return RASTER_TYPES.has(type) || type === 'image/svg+xml'
}
