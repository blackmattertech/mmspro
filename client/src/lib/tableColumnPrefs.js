const STORAGE_VERSION = 'v2'

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
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object') return parsed
    return null
  } catch {
    return null
  }
}

export function saveTableColumnPrefs(storageKey, prefs) {
  if (!storageKey || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(prefs))
  } catch {
    // ignore quota / private mode
  }
}

function uniqueValid(ids, valid) {
  const seen = new Set()
  const list = []
  for (const id of ids || []) {
    if (!valid.has(id) || seen.has(id)) continue
    seen.add(id)
    list.push(id)
  }
  return { list, seen }
}

function hiddenByDefault(columnDefs, exceptIds = null) {
  return (columnDefs || [])
    .filter((col) => (
      col.defaultVisible === false
      && !col.locked
      && !exceptIds?.has(col.id)
    ))
    .map((col) => col.id)
}

const ACTIONS_COLUMN_ID = 'actions'

/** Keep the actions column at the end, including after a saved reorder. */
export function pinActionsLast(order) {
  if (!order?.length || !order.includes(ACTIONS_COLUMN_ID)) return order
  if (order[order.length - 1] === ACTIONS_COLUMN_ID) return order
  const next = order.filter((id) => id !== ACTIONS_COLUMN_ID)
  next.push(ACTIONS_COLUMN_ID)
  return next
}

/** Default order matches the picker: shown columns, then hidden ones. */
function groupUntouchedOrder(result, columnDefs) {
  const allIds = (columnDefs || []).map((col) => col.id)
  if (result.order.join('|') !== allIds.join('|')) return result
  const defHidden = hiddenByDefault(columnDefs).slice().sort().join('|')
  const hidden = result.hidden.slice().sort().join('|')
  if (defHidden !== hidden) return result
  const hiddenSet = new Set(result.hidden)
  const shown = []
  const concealed = []
  for (const id of result.order) {
    if (hiddenSet.has(id)) concealed.push(id)
    else shown.push(id)
  }
  const order = [...shown, ...concealed]
  if (order.join('|') === result.order.join('|')) return result
  return { ...result, order }
}

/**
 * Column order plus hidden ids.
 * A legacy visible-id array keeps that visible set and appends the rest.
 * Columns marked defaultVisible: false stay hidden until the user shows them.
 * Later saves remember hides. Newly added columns follow defaultVisible.
 */
export function resolveColumnPrefs(saved, columnDefs) {
  const allIds = (columnDefs || []).map((col) => col.id)
  const valid = new Set(allIds)
  const byId = new Map((columnDefs || []).map((col) => [col.id, col]))
  const locked = new Set((columnDefs || []).filter((col) => col.locked).map((col) => col.id))

  if (!saved) {
    return finalizeColumnPrefs(
      { order: allIds, hidden: hiddenByDefault(columnDefs), known: allIds },
      columnDefs,
    )
  }

  if (Array.isArray(saved)) {
    const { list, seen } = uniqueValid(saved, valid)
    for (const id of allIds) {
      if (!seen.has(id)) list.push(id)
    }
    return finalizeColumnPrefs(
      { order: list, hidden: hiddenByDefault(columnDefs, seen), known: allIds },
      columnDefs,
    )
  }

  const { list, seen } = uniqueValid(saved.order, valid)
  const known = new Set((saved.known || []).filter((id) => valid.has(id)))
  const hidden = new Set((saved.hidden || []).filter((id) => (
    valid.has(id) && known.has(id) && !locked.has(id)
  )))
  for (const id of allIds) {
    if (seen.has(id)) continue
    list.push(id)
    const def = byId.get(id)
    if (def?.defaultVisible === false && !known.has(id) && !locked.has(id)) hidden.add(id)
  }
  return finalizeColumnPrefs({ order: list, hidden: [...hidden], known: allIds }, columnDefs)
}

function finalizeColumnPrefs(result, columnDefs) {
  const grouped = groupUntouchedOrder(result, columnDefs)
  const order = pinActionsLast(grouped.order)
  if (order === grouped.order) return grouped
  return { ...grouped, order }
}

export function visibleIdsFromPrefs(prefs, columnDefs) {
  const locked = new Set((columnDefs || []).filter((col) => col.locked).map((col) => col.id))
  const hidden = new Set(prefs?.hidden || [])
  return pinActionsLast(
    (prefs?.order || []).filter((id) => locked.has(id) || !hidden.has(id)),
  )
}

/** @param {string[]|{ order?: string[], hidden?: string[] }|null} savedOrDefault */
export function normalizeVisibleColumns(savedOrDefault, columnDefs) {
  if (!columnDefs?.length) return []
  if (Array.isArray(savedOrDefault) && savedOrDefault.length && !savedOrDefault.order) {
    const prefs = resolveColumnPrefs(
      { order: savedOrDefault, hidden: [], known: columnDefs.map((col) => col.id) },
      columnDefs,
    )
    const hidden = columnDefs
      .map((col) => col.id)
      .filter((id) => !savedOrDefault.includes(id) && !col.locked)
    return visibleIdsFromPrefs({ ...prefs, hidden }, columnDefs)
  }
  const prefs = resolveColumnPrefs(savedOrDefault, columnDefs)
  const visible = visibleIdsFromPrefs(prefs, columnDefs)
  if (visible.length) return visible
  const first = columnDefs.find((col) => !col.locked)?.id
  return first ? [first] : []
}
