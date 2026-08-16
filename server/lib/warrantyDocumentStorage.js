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
])

const EXTENSION_MIME = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
}

function resolveContentType(contentType, fileName) {
  const raw = String(contentType || '').trim().toLowerCase()
  if (raw && raw !== 'application/octet-stream') return raw

  const ext = String(fileName || '').split('.').pop()?.toLowerCase()
  return EXTENSION_MIME[ext] || raw || ''
}

export function warrantyDocumentPath(orgId, warrantyId, fileName) {
  const safe = String(fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_')
  const uuid = crypto.randomUUID()
  return `${orgId}/warranties/${warrantyId}/${uuid}-${safe}`
}

export function decodeWarrantyDocumentPayload({ contentType, data, fileName }) {
  const resolvedType = resolveContentType(contentType, fileName)
  if (!ALLOWED_TYPES.has(resolvedType)) {
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
    fileName: String(fileName || 'document').trim() || 'document',
    fileSize: buffer.length,
    contentType: resolvedType,
  }
}

export async function uploadWarrantyDocumentFile(orgId, warrantyId, payload) {
  const { buffer, fileName, fileSize, contentType } = decodeWarrantyDocumentPayload(payload)
  const path = warrantyDocumentPath(orgId, warrantyId, fileName)

  const { error } = await supabaseAdmin.storage
    .from(ORG_ASSETS_BUCKET)
    .upload(path, buffer, { upsert: false, contentType })

  if (error) {
    const message = String(error.message || '')
    if (message.toLowerCase().includes('mime type') && message.toLowerCase().includes('not supported')) {
      throw Object.assign(
        new Error('This file type is not enabled in storage. Apply patch 56-org-assets-warranty-documents.sql in Supabase.'),
        { status: 400 },
      )
    }
    throw error
  }
  return { path, fileName, fileSize, contentType }
}

export async function getWarrantyDocumentSignedUrl(path, expiresIn = 3600) {
  const { data, error } = await supabaseAdmin.storage
    .from(ORG_ASSETS_BUCKET)
    .createSignedUrl(path, expiresIn)

  if (error) throw error
  return data?.signedUrl || null
}

export async function deleteWarrantyDocumentFile(path) {
  if (!path) return
  const { error } = await supabaseAdmin.storage.from(ORG_ASSETS_BUCKET).remove([path])
  if (error) throw error
}
