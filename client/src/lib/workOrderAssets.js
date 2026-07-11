import { supabase } from './supabase'
import { createId } from './id'

export const WORK_ORDER_ASSETS_BUCKET = 'work-order-assets'
const MAX_BYTES = 10 * 1024 * 1024

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const FILE_TYPES = new Set([
  ...IMAGE_TYPES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

function sanitizeFileName(name) {
  return String(name || 'file')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .slice(0, 120) || 'file'
}

export function validateWorkOrderFile(file, fieldType) {
  if (!file) return 'No file selected'

  const allowed = fieldType === 'image' ? IMAGE_TYPES : FILE_TYPES
  if (!allowed.has(file.type)) {
    if (fieldType === 'image') {
      return 'Image must be JPEG, PNG, WebP, or GIF'
    }
    return 'File type not supported. Use PDF, DOC, DOCX, XLS, XLSX, JPG, or PNG'
  }

  if (file.size > MAX_BYTES) {
    return 'File must be 10 MB or smaller'
  }

  return null
}

export function workOrderFileStoragePath(orgId, workOrderId, fieldId, fileName) {
  const safeName = sanitizeFileName(fileName)
  const unique = createId()
  return `${orgId}/${workOrderId}/${fieldId}/${unique}-${safeName}`
}

export async function uploadWorkOrderFile(orgId, workOrderId, fieldId, file, fieldType) {
  if (!supabase) throw new Error('Storage is not configured')

  const validationError = validateWorkOrderFile(file, fieldType)
  if (validationError) throw new Error(validationError)

  const path = workOrderFileStoragePath(orgId, workOrderId, fieldId, file.name)

  const { error } = await supabase.storage
    .from(WORK_ORDER_ASSETS_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type })

  if (error) throw new Error(error.message)

  return {
    path,
    name: file.name,
    mime_type: file.type,
    size: file.size,
    bucket: WORK_ORDER_ASSETS_BUCKET,
  }
}

export async function getWorkOrderFileSignedUrl(path, expiresIn = 3600) {
  if (!supabase || !path) return null

  const { data, error } = await supabase.storage
    .from(WORK_ORDER_ASSETS_BUCKET)
    .createSignedUrl(path, expiresIn)

  if (error) throw new Error(error.message)
  return data?.signedUrl ?? null
}
