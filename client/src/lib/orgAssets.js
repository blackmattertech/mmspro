import { supabase } from './supabase'

export const ORG_ASSETS_BUCKET = 'org-assets'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const EXT_BY_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export function validateLogoFile(file) {
  if (!file) return 'No file selected'
  if (!ALLOWED_TYPES.has(file.type)) {
    return 'Logo must be JPEG, PNG, WebP, or GIF'
  }
  if (file.size > MAX_BYTES) {
    return 'Logo must be 5 MB or smaller'
  }
  return null
}

export function logoStoragePath(orgId, mimeType) {
  const ext = EXT_BY_TYPE[mimeType] || 'png'
  return `${orgId}/logo.${ext}`
}

export async function uploadOrgLogo(orgId, file) {
  if (!supabase) throw new Error('Storage is not configured')

  const validationError = validateLogoFile(file)
  if (validationError) throw new Error(validationError)

  const path = logoStoragePath(orgId, file.type)

  const { error } = await supabase.storage
    .from(ORG_ASSETS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })

  if (error) throw new Error(error.message)
  return path
}

export function employeePhotoStoragePath(orgId, employeeId, mimeType) {
  const ext = EXT_BY_TYPE[mimeType] || 'png'
  return `${orgId}/employees/${employeeId}.${ext}`
}

export async function uploadEmployeePhoto(orgId, employeeId, file) {
  if (!supabase) throw new Error('Storage is not configured')

  const validationError = validateLogoFile(file)
  if (validationError) throw new Error(validationError)

  const path = employeePhotoStoragePath(orgId, employeeId, file.type)

  const { error } = await supabase.storage
    .from(ORG_ASSETS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })

  if (error) throw new Error(error.message)
  return path
}

export async function deleteOrgLogo(path) {
  if (!supabase || !path) return

  const { error } = await supabase.storage.from(ORG_ASSETS_BUCKET).remove([path])
  if (error) throw new Error(error.message)
}

export async function getOrgAssetSignedUrl(path, expiresIn = 3600) {
  if (!supabase || !path) return null

  const { data, error } = await supabase.storage
    .from(ORG_ASSETS_BUCKET)
    .createSignedUrl(path, expiresIn)

  if (error) throw new Error(error.message)
  return data?.signedUrl ?? null
}
