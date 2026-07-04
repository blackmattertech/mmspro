export function readFormDraft(key) {
  if (!key) return null
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function writeFormDraft(key, value) {
  if (!key) return
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota or private browsing — ignore
  }
}

export function clearFormDraft(key) {
  if (!key) return
  try {
    sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export function assetFieldDraftKey(orgId, { editingId = null, mode = 'all' } = {}) {
  if (!orgId) return null
  return editingId
    ? `mms:asset-field-draft:${orgId}:edit:${editingId}`
    : `mms:asset-field-draft:${orgId}:create:${mode}`
}

export function manualWorkOrderDraftKey(orgId) {
  return orgId ? `mms:manual-wo-draft:${orgId}` : null
}

export function serializeWorkOrderValues(values) {
  const out = {}
  for (const [fieldId, value] of Object.entries(values || {})) {
    if (value === null || value === undefined) continue

    if (typeof value === 'object' && Array.isArray(value.files)) {
      const serializable = value.files
        .filter((item) => !(item?.file instanceof File))
        .map(({ file, previewUrl, error, ...rest }) => rest)
      if (serializable.length) out[fieldId] = { files: serializable }
      continue
    }

    if (typeof value === 'object' && value.file instanceof File) continue
    if (typeof value === 'object' && value.previewUrl) {
      const { previewUrl, file, ...rest } = value
      if (Object.keys(rest).length) out[fieldId] = rest
      continue
    }
    out[fieldId] = value
  }
  return out
}
