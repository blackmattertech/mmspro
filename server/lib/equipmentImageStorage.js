import { supabaseAdmin } from '../services/supabase.js'

const ORG_ASSETS_BUCKET = 'org-assets'
const EQUIPMENT_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const EQUIPMENT_IMAGE_MAX_BYTES = 3 * 1024 * 1024

const EXT_BY_TYPE = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export function equipmentImageStoragePath(orgId, equipmentId, contentType) {
  const ext = EXT_BY_TYPE[contentType] || 'png'
  return `${orgId}/equipment/${equipmentId}.${ext}`
}

export function decodeEquipmentImagePayload({ contentType, data }) {
  if (!EQUIPMENT_IMAGE_TYPES.has(contentType)) {
    throw Object.assign(new Error('Image must be PNG, JPG, or WebP'), { status: 400 })
  }
  if (!data || typeof data !== 'string') {
    throw Object.assign(new Error('Image data is required'), { status: 400 })
  }

  const base64 = data.includes(',') ? data.split(',').pop() : data
  const buffer = Buffer.from(base64, 'base64')
  if (!buffer.length) {
    throw Object.assign(new Error('Image data is invalid'), { status: 400 })
  }
  if (buffer.length > EQUIPMENT_IMAGE_MAX_BYTES) {
    throw Object.assign(new Error('Image must be 3 MB or smaller'), { status: 400 })
  }

  return buffer
}

export async function uploadEquipmentImageFile(orgId, equipmentId, { contentType, data }) {
  const buffer = decodeEquipmentImagePayload({ contentType, data })
  const path = equipmentImageStoragePath(orgId, equipmentId, contentType)

  const { error } = await supabaseAdmin.storage
    .from(ORG_ASSETS_BUCKET)
    .upload(path, buffer, { upsert: true, contentType })

  if (error) throw error
  return path
}

export async function deleteEquipmentImageFile(path) {
  if (!path) return
  const { error } = await supabaseAdmin.storage.from(ORG_ASSETS_BUCKET).remove([path])
  if (error) throw error
}
