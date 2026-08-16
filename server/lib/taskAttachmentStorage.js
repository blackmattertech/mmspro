import { supabaseAdmin } from '../services/supabase.js'

const ORG_ASSETS_BUCKET = 'org-assets'
const MAX_BYTES = 25 * 1024 * 1024

const ALLOWED_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'video/mp4', 'video/webm', 'video/quicktime',
])

export function taskAttachmentPath(orgId, taskId, fileName) {
  const safe = String(fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')
  const uuid = crypto.randomUUID()
  return `${orgId}/tasks/${taskId}/${uuid}-${safe}`
}

export function decodeAttachmentPayload({ contentType, data, fileName }) {
  if (!ALLOWED_TYPES.has(contentType)) {
    throw Object.assign(new Error('File type is not allowed'), { status: 400 })
  }
  if (!data || typeof data !== 'string') {
    throw Object.assign(new Error('File data is required'), { status: 400 })
  }

  const base64 = data.includes(',') ? data.split(',').pop() : data
  const buffer = Buffer.from(base64, 'base64')
  if (!buffer.length) {
    throw Object.assign(new Error('File data is invalid'), { status: 400 })
  }
  if (buffer.length > MAX_BYTES) {
    throw Object.assign(new Error('File must be 25 MB or smaller'), { status: 400 })
  }

  return {
    buffer,
    fileName: String(fileName || 'attachment').trim() || 'attachment',
    fileSize: buffer.length,
    contentType,
  }
}

export async function uploadTaskAttachment(orgId, taskId, payload) {
  const { buffer, fileName, fileSize, contentType } = decodeAttachmentPayload(payload)
  const path = taskAttachmentPath(orgId, taskId, fileName)

  const { error } = await supabaseAdmin.storage
    .from(ORG_ASSETS_BUCKET)
    .upload(path, buffer, { upsert: false, contentType })

  if (error) throw error
  return { path, fileName, fileSize, contentType }
}

export async function getTaskAttachmentSignedUrl(path, expiresIn = 3600) {
  const { data, error } = await supabaseAdmin.storage
    .from(ORG_ASSETS_BUCKET)
    .createSignedUrl(path, expiresIn)

  if (error) throw error
  return data?.signedUrl || null
}

export async function deleteTaskAttachmentFile(path) {
  if (!path) return
  const { error } = await supabaseAdmin.storage.from(ORG_ASSETS_BUCKET).remove([path])
  if (error) throw error
}
