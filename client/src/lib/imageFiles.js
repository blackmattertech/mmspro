export const IMAGE_ACCEPT = 'image/*,.svg,.jpg,.jpeg,.png,.gif,.webp,.bmp,.avif,.ico,.heic,.heif'

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
  if (type.startsWith('image/')) return true
  return /\.(jpe?g|png|gif|webp|bmp|svg|avif|ico|heic|heif)$/i.test(String(file?.name || ''))
}
