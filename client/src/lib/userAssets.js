import { supabase } from './supabase'

export const USER_ASSETS_BUCKET = 'user-assets'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export function validateAvatarFile(file) {
  if (!file) return 'No file selected'
  if (!ALLOWED_TYPES.has(file.type)) {
    return 'Photo must be JPEG, PNG, WebP, or GIF'
  }
  if (file.size > MAX_BYTES) {
    return 'Photo must be 5 MB or smaller'
  }
  return null
}

export function avatarStoragePath(userId, mimeType) {
  const ext = EXT_BY_TYPE[mimeType] || 'png'
  return `${userId}/avatar.${ext}`
}

export async function uploadUserAvatar(userId, file) {
  if (!supabase) throw new Error('Storage is not configured')

  const validationError = validateAvatarFile(file)
  if (validationError) throw new Error(validationError)

  const path = avatarStoragePath(userId, file.type)

  const { error } = await supabase.storage
    .from(USER_ASSETS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })

  if (error) throw new Error(error.message)
  return path
}

export async function deleteUserAvatar(path) {
  if (!supabase || !path) return

  const { error } = await supabase.storage.from(USER_ASSETS_BUCKET).remove([path])
  if (error) throw new Error(error.message)
}

export async function getUserAssetSignedUrl(path, expiresIn = 3600) {
  if (!supabase || !path) return null

  const { data, error } = await supabase.storage
    .from(USER_ASSETS_BUCKET)
    .createSignedUrl(path, expiresIn)

  if (error) throw new Error(error.message)
  return data?.signedUrl ?? null
}
