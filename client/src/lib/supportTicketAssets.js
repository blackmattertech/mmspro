import {
  SUPPORT_ATTACHMENT_ACCEPT,
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENT_MAX_FILES,
  SUPPORT_ATTACHMENT_MIME,
} from '../../../shared/supportTickets.js'
import { createCompanyAttachmentUploads, createAdminAttachmentUploads } from './supportApi'

const NAME_RE = /\.(jpe?g|png|pdf|xlsx|docx)$/i

export { SUPPORT_ATTACHMENT_ACCEPT, SUPPORT_ATTACHMENT_MAX_FILES }

export function formatSupportFileSize(bytes) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function isSupportImageAttachment(file) {
  const mime = String(file?.mime_type || file?.type || '').toLowerCase()
  if (mime.startsWith('image/')) return true
  return /\.(jpe?g|png)$/i.test(String(file?.name || ''))
}

export function validateSupportFile(file) {
  if (!file) return 'No file selected'
  const name = String(file.name || '')
  const mime = String(file.type || '').toLowerCase()
  const mimeOk = SUPPORT_ATTACHMENT_MIME.includes(mime) || NAME_RE.test(name)
  if (!mimeOk) return 'File must be JPG, PNG, PDF, XLSX, or DOCX'
  if (file.size > SUPPORT_ATTACHMENT_MAX_BYTES) return 'File must be 25 MB or smaller'
  return null
}

export async function uploadSupportFiles(ticketId, files, { admin = false } = {}) {
  const list = Array.from(files || [])
  if (!list.length) return []
  if (list.length > SUPPORT_ATTACHMENT_MAX_FILES) {
    throw new Error(`You can attach up to ${SUPPORT_ATTACHMENT_MAX_FILES} files`)
  }
  for (const file of list) {
    const error = validateSupportFile(file)
    if (error) throw new Error(error)
  }

  const request = admin ? createAdminAttachmentUploads : createCompanyAttachmentUploads
  const { uploads } = await request(ticketId, list.map((file) => ({
    name: file.name,
    mime_type: file.type || 'application/octet-stream',
    size: file.size,
  })))

  const uploaded = []
  for (let index = 0; index < uploads.length; index += 1) {
    const slot = uploads[index]
    const file = list[index]
    const response = await fetch(slot.signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || slot.mime_type || 'application/octet-stream',
      },
      body: file,
    })
    if (!response.ok) {
      throw new Error(`Could not upload ${file.name}`)
    }
    uploaded.push({
      path: slot.path,
      name: slot.name,
      mime_type: slot.mime_type,
      size: slot.size,
      bucket: slot.bucket,
    })
  }
  return uploaded
}

/** Keep pending local file previews for the composer. */
export function createPendingSupportFiles(fileList) {
  return Array.from(fileList || []).map((file) => {
    const error = validateSupportFile(file)
    if (error) throw new Error(error)
    return {
      id: `${file.name}-${file.size}-${file.lastModified}`,
      file,
      name: file.name,
      size: file.size,
      mime_type: file.type,
      previewUrl: isSupportImageAttachment(file) ? URL.createObjectURL(file) : null,
    }
  })
}

export function revokePendingSupportFiles(files = []) {
  for (const file of files) {
    if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl)
  }
}
