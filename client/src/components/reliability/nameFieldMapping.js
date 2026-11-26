const STORAGE_PREFIX = 'mmspro.reliability.nameFieldId'

export function reliabilityNameFieldStorageKey(orgId) {
  return `${STORAGE_PREFIX}.${orgId || 'org'}`
}

export function readStoredNameFieldId(orgId) {
  try {
    return window.localStorage.getItem(reliabilityNameFieldStorageKey(orgId)) || ''
  } catch {
    return ''
  }
}

export function writeStoredNameFieldId(orgId, fieldId) {
  try {
    const key = reliabilityNameFieldStorageKey(orgId)
    if (!fieldId) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, fieldId)
  } catch {
    // ignore quota / private mode
  }
}

/** Prefer Asset Master "Equipment Name" when no mapping is stored yet. */
export function defaultNameFieldId(fields = []) {
  const match = (fields || []).find((field) => /equipment\s*name/i.test(field.name || field.label || ''))
  return match?.id || ''
}
