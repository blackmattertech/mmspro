import { createId } from './id'

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

export function getFilePreviewSrc(item) {
  if (!item) return null
  if (item.previewUrl) return item.previewUrl
  if (isImageFileItem(item) && item.url) return item.url
  return null
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
