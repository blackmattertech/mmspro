import { createId } from './id'
import { uploadWorkOrderFile } from './workOrderAssets'

export function getWorkOrderFiles(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (Array.isArray(value.files)) return value.files
  if (value.path || value.file instanceof File) return [value]
  return []
}

export function workOrderFilesValue(files) {
  const list = (files || []).filter(Boolean)
  return list.length ? { files: list } : null
}

function fileMeta(item) {
  const file = item?.file instanceof File ? item.file : item
  const type = String(item?.type || item?.mime_type || file?.type || '').toLowerCase()
  const name = String(item?.name || item?.file_name || item?.path || file?.name || '').toLowerCase()
  return { type, name }
}

export function getAttachmentKind(item) {
  const { type, name } = fileMeta(item)
  if (type.startsWith('image/') || /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(name)) return 'image'
  if (type.includes('pdf') || name.endsWith('.pdf')) return 'pdf'
  if (type.includes('zip') || /\.(zip|rar|7z)$/i.test(name)) return 'zip'
  return 'file'
}

export function createLocalFileItem(file, fieldType) {
  const kind = getAttachmentKind(file)
  const previewUrl = kind === 'image' ? URL.createObjectURL(file) : null

  return {
    id: createId(),
    file,
    name: file.name,
    size: file.size,
    type: file.type || (fieldType === 'image' ? 'image/*' : ''),
    previewUrl,
  }
}

export function isImageFileItem(item) {
  if (!item) return false
  if (item.previewUrl) return true
  return getAttachmentKind(item) === 'image'
}

function isUsablePreviewUrl(url) {
  const src = String(url || '')
  if (!src) return false
  if (src.startsWith('blob:')) return false
  return true
}

export function getFilePreviewSrc(item) {
  if (!item) return null
  if (item.previewUrl) {
    if (item.file instanceof File) return item.previewUrl
    if (isUsablePreviewUrl(item.previewUrl)) return item.previewUrl
  }
  if (isImageFileItem(item) && isUsablePreviewUrl(item.url)) return item.url
  const path = String(item.path || item.url || '')
  if (/^https?:\/\//i.test(path)) return path
  return null
}

export function filesNeedStoredPreview(value) {
  const files = getWorkOrderFiles(value)
  if (!files.length) return true
  return files.every((file) => !file.path && !file.url && !(file.file instanceof File))
}

export async function persistFormFileValues(orgId, recordId, values, folder = 'form-fields') {
  if (!orgId || !recordId || !values || typeof values !== 'object') return values
  const next = { ...values }
  let changed = false

  for (const [fieldId, value] of Object.entries(values)) {
    const files = getWorkOrderFiles(value)
    if (!files.some((item) => item?.file instanceof File)) continue
    const stored = []
    for (const item of files) {
      if (item?.file instanceof File) {
        const kind = isImageFileItem(item) ? 'image' : 'file'
        const uploaded = await uploadWorkOrderFile(orgId, `${folder}/${recordId}`, fieldId, item.file, kind)
        stored.push({
          path: uploaded.path,
          name: uploaded.name || item.name || item.file.name,
          size: uploaded.size ?? item.size ?? item.file.size,
          type: uploaded.mime_type || item.type || item.file.type,
          bucket: uploaded.bucket,
        })
        changed = true
        continue
      }
      stored.push(item)
    }
    next[fieldId] = workOrderFilesValue(stored)
  }

  return changed ? next : values
}

export function revokeWorkOrderFilePreviews(value) {
  for (const item of getWorkOrderFiles(value)) {
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl)
  }
}

export function getStoredWorkOrderFiles(valueJson) {
  if (!valueJson) return []
  if (Array.isArray(valueJson.files) && valueJson.files.length) return valueJson.files
  if (valueJson.path) return [valueJson]
  return []
}
