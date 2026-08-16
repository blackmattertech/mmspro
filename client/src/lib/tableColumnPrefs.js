const STORAGE_VERSION = 'v1'

export function buildTableColumnStorageKey(orgId, userId, tableId) {
  if (!orgId || !userId || !tableId) return null
  return `mmspro.tableColumns.${STORAGE_VERSION}:${orgId}:${userId}:${tableId}`
}

export function loadTableColumnPrefs(storageKey) {
  if (!storageKey || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveTableColumnPrefs(storageKey, columnIds) {
  if (!storageKey || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(columnIds))
  } catch {
    // ignore quota / private mode
  }
}

/** @param {string[]} savedOrDefault */
export function normalizeVisibleColumns(savedOrDefault, columnDefs) {
  if (!columnDefs?.length) return []

  const validIds = new Set(columnDefs.map((col) => col.id))
  const lockedIds = columnDefs.filter((col) => col.locked).map((col) => col.id)
  const defaultIds = columnDefs
    .filter((col) => col.defaultVisible !== false)
    .map((col) => col.id)

  const source = Array.isArray(savedOrDefault) ? savedOrDefault : defaultIds
  const picked = new Set(
    source.filter((id) => validIds.has(id)),
  )
  lockedIds.forEach((id) => picked.add(id))

  const nonLockedVisible = [...picked].filter(
    (id) => !columnDefs.find((col) => col.id === id)?.locked,
  )
  if (!nonLockedVisible.length) {
    const first = columnDefs.find((col) => !col.locked)?.id
    if (first) picked.add(first)
  }

  return columnDefs
    .filter((col) => picked.has(col.id))
    .map((col) => col.id)
}
