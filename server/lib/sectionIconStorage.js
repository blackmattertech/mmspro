import { supabaseAdmin } from '../services/supabase.js'

const ORG_ASSETS_BUCKET = 'org-assets'
const SECTION_ICON_TYPES = new Set(['image/png', 'image/svg+xml'])
const SECTION_ICON_MAX_BYTES = 2 * 1024 * 1024

const EXT_BY_TYPE = {
  'image/png': 'png',
  'image/svg+xml': 'svg',
}

export function sectionIconStoragePath(orgId, sectionId, contentType) {
  const ext = EXT_BY_TYPE[contentType] || 'png'
  return `${orgId}/section-icons/${sectionId}.${ext}`
}

export function decodeSectionIconPayload({ contentType, data }) {
  if (!SECTION_ICON_TYPES.has(contentType)) {
    throw Object.assign(new Error('Section icon must be PNG or SVG'), { status: 400 })
  }
  if (!data || typeof data !== 'string') {
    throw Object.assign(new Error('Icon data is required'), { status: 400 })
  }

  const base64 = data.includes(',') ? data.split(',').pop() : data
  const buffer = Buffer.from(base64, 'base64')
  if (!buffer.length) {
    throw Object.assign(new Error('Icon data is invalid'), { status: 400 })
  }
  if (buffer.length > SECTION_ICON_MAX_BYTES) {
    throw Object.assign(new Error('Section icon must be 2 MB or smaller'), { status: 400 })
  }

  return buffer
}

export async function uploadSectionIconFile(orgId, sectionId, { contentType, data }) {
  const buffer = decodeSectionIconPayload({ contentType, data })
  const path = sectionIconStoragePath(orgId, sectionId, contentType)

  const { error } = await supabaseAdmin.storage
    .from(ORG_ASSETS_BUCKET)
    .upload(path, buffer, { upsert: true, contentType })

  if (error) throw error
  return path
}

export async function deleteSectionIconFile(path) {
  if (!path) return
  const { error } = await supabaseAdmin.storage.from(ORG_ASSETS_BUCKET).remove([path])
  if (error) throw error
}
