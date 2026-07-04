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

export function createLocalFileItem(file, fieldType) {
  const previewUrl = fieldType === 'image' && file.type.startsWith('image/')
    ? URL.createObjectURL(file)
    : null

  return {
    id: crypto.randomUUID(),
    file,
    name: file.name,
    size: file.size,
    type: file.type,
    previewUrl,
  }
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
