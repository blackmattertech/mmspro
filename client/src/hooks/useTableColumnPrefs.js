import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './useAuth'
import { useOrg } from './useOrg'
import { usePermissions } from './usePermissions'
import {
  buildTableColumnStorageKey,
  loadTableColumnPrefs,
  resolveColumnPrefs,
  saveTableColumnPrefs,
  pinActionsLast,
  visibleIdsFromPrefs,
  withOrgVersion,
  readStoredOrgVersion,
} from '../lib/tableColumnPrefs'
import {
  getTableColumnDefault,
  saveTableColumnDefault,
} from '../lib/api-table-column-defaults'

function buildColumnsSignature(columnDefs) {
  if (!columnDefs?.length) return ''
  return columnDefs
    .map((col) => `${col.id}:${col.locked ? 1 : 0}:${col.defaultVisible === false ? 0 : 1}`)
    .join('|')
}

function samePrefs(a, b) {
  if (!a || !b) return false
  return a.order.join('|') === b.order.join('|') && a.hidden.join('|') === b.hidden.join('|')
}

/** Apply a picker order while leaving locked columns in their current slots. */
function applyColumnOrder(previousOrder, orderedIds) {
  const valid = new Set(previousOrder)
  const wanted = []
  const seen = new Set()
  for (const id of orderedIds || []) {
    if (!valid.has(id) || seen.has(id)) continue
    wanted.push(id)
    seen.add(id)
  }
  if (!wanted.length) return previousOrder
  let index = 0
  const next = []
  for (const id of previousOrder) {
    if (seen.has(id)) {
      next.push(wanted[index])
      index += 1
    } else {
      next.push(id)
    }
  }
  const pinned = pinActionsLast(next)
  return pinned.join('|') === previousOrder.join('|') ? previousOrder : pinned
}

/**
 * Per-user, per-org column visibility and order for a table.
 * Org admins can publish defaults that force-refresh every user's prefs.
 * @param {string} tableId
 * @param {{ id: string, label: string, defaultVisible?: boolean, locked?: boolean }[]} columnDefs
 */
export function useTableColumnPrefs(tableId, columnDefs) {
  const { user } = useAuth()
  const { org } = useOrg()
  const { isOrgAdmin } = usePermissions()
  const columnsSignature = buildColumnsSignature(columnDefs)

  const [prefs, setPrefs] = useState(() => resolveColumnPrefs(null, columnDefs))
  const [loadedKey, setLoadedKey] = useState(null)
  const [orgDefault, setOrgDefault] = useState(null)
  const [makingDefault, setMakingDefault] = useState(false)

  const storageKey = useMemo(
    () => buildTableColumnStorageKey(org?.id, user?.id, tableId),
    [org?.id, user?.id, tableId],
  )
  const columnDefsRef = useRef(columnDefs)
  const storageKeyRef = useRef(storageKey)
  const loadedKeyRef = useRef(loadedKey)
  const orgDefaultRef = useRef(orgDefault)
  columnDefsRef.current = columnDefs
  storageKeyRef.current = storageKey
  loadedKeyRef.current = loadedKey
  orgDefaultRef.current = orgDefault

  const writePrefs = useCallback((next, orgVersion) => {
    const key = storageKeyRef.current
    if (!key || loadedKeyRef.current !== key) return
    const version = orgVersion ?? orgDefaultRef.current?.version ?? readStoredOrgVersion(next)
    saveTableColumnPrefs(key, withOrgVersion(next, version))
  }, [])

  const savedOrderIds = (saved) => {
    if (Array.isArray(saved)) return saved
    return saved?.order || []
  }

  useEffect(() => {
    if (!tableId || !columnDefs.length) {
      setLoadedKey(null)
      setOrgDefault(null)
      return undefined
    }
    let cancelled = false
    const saved = storageKey ? loadTableColumnPrefs(storageKey) : null

    getTableColumnDefault(tableId)
      .then((row) => {
        if (cancelled) return
        const version = Number(row?.version) || 0
        const orgPrefs = row?.prefs
          && version > 0
          && (row.prefs.order?.length || row.prefs.hidden?.length)
          ? row.prefs
          : null
        setOrgDefault(orgPrefs ? { prefs: orgPrefs, version } : null)

        const userVersion = readStoredOrgVersion(saved)
        const forceOrg = Boolean(orgPrefs && version > 0 && version > userVersion)
        const source = forceOrg ? orgPrefs : saved
        const next = resolveColumnPrefs(source, columnDefs)
        const valid = new Set(columnDefs.map((col) => col.id))
        const currentHasFields = columnDefs.some((col) => String(col.id).startsWith('field:'))
        const dropsUnloadedField = savedOrderIds(saved).some((id) => (
          String(id).startsWith('field:') && !valid.has(id) && !currentHasFields
        ))
        setPrefs((prev) => (samePrefs(prev, next) ? prev : next))
        const key = dropsUnloadedField ? null : (storageKey ?? `memory:${tableId}`)
        setLoadedKey(key)
        if (forceOrg && storageKey && key === storageKey) {
          saveTableColumnPrefs(storageKey, withOrgVersion(next, version))
        }
      })
      .catch(() => {
        if (cancelled) return
        const next = resolveColumnPrefs(saved, columnDefs)
        setOrgDefault(null)
        setPrefs((prev) => (samePrefs(prev, next) ? prev : next))
        setLoadedKey(storageKey ?? `memory:${tableId}`)
      })

    return () => { cancelled = true }
  }, [tableId, storageKey, columnsSignature])

  useEffect(() => {
    if (!storageKey || loadedKey !== storageKey) return
    const version = orgDefault?.version || readStoredOrgVersion(prefs)
    saveTableColumnPrefs(storageKey, withOrgVersion(prefs, version))
  }, [storageKey, prefs, loadedKey, orgDefault?.version])

  const visibleColumnIds = useMemo(
    () => visibleIdsFromPrefs(prefs, columnDefs),
    [prefs, columnsSignature],
  )

  const toggleColumn = useCallback((columnId) => {
    const def = columnDefsRef.current.find((col) => col.id === columnId)
    if (!def || def.locked) return
    setPrefs((prev) => {
      const resolved = resolveColumnPrefs(prev, columnDefsRef.current)
      const hidden = new Set(resolved.hidden)
      if (hidden.has(columnId)) hidden.delete(columnId)
      else hidden.add(columnId)
      const visible = resolved.order.filter((id) => !hidden.has(id))
      if (!visible.length) return prev
      const next = { ...resolved, hidden: [...hidden] }
      writePrefs(next)
      return next
    })
  }, [writePrefs])

  const resetColumns = useCallback(() => {
    const org = orgDefaultRef.current
    const next = resolveColumnPrefs(org?.prefs || null, columnDefsRef.current)
    writePrefs(next, org?.version || 0)
    setPrefs(next)
  }, [writePrefs])

  const reorderColumns = useCallback((orderedIds) => {
    setPrefs((prev) => {
      const resolved = resolveColumnPrefs(prev, columnDefsRef.current)
      const nextOrder = applyColumnOrder(resolved.order, orderedIds)
      if (nextOrder === resolved.order) return prev
      const next = { ...resolved, order: nextOrder }
      writePrefs(next)
      return next
    })
  }, [writePrefs])

  const moveColumn = useCallback((columnId, position) => {
    setPrefs((prev) => {
      const resolved = resolveColumnPrefs(prev, columnDefsRef.current)
      if (!resolved.order.includes(columnId)) return prev
      const order = resolved.order.filter((id) => id !== columnId)
      if (position === 'bottom') order.push(columnId)
      else order.unshift(columnId)
      const pinned = pinActionsLast(order)
      const hidden = resolved.hidden.filter((id) => id !== columnId)
      const next = { ...resolved, order: pinned, hidden }
      writePrefs(next)
      return next
    })
  }, [writePrefs])

  const isVisible = useCallback(
    (columnId) => visibleColumnIds.includes(columnId),
    [visibleColumnIds],
  )

  const saveColumns = useCallback(() => {
    const key = storageKeyRef.current
    if (!key) return false
    const next = resolveColumnPrefs(prefs, columnDefsRef.current)
    const version = orgDefaultRef.current?.version || readStoredOrgVersion(prefs)
    saveTableColumnPrefs(key, withOrgVersion(next, version))
    setLoadedKey(key)
    setPrefs((prev) => (samePrefs(prev, next) ? prev : next))
    return true
  }, [prefs])

  /** Set visible columns (and their order); remaining defs stay in order but hidden. */
  const applyVisibleOrder = useCallback((visibleIds) => {
    setPrefs((prev) => {
      const defs = columnDefsRef.current
      const resolved = resolveColumnPrefs(prev, defs)
      const valid = new Set(resolved.order)
      const locked = new Set(defs.filter((col) => col.locked).map((col) => col.id))
      const visible = []
      const seen = new Set()
      for (const id of visibleIds || []) {
        if (!valid.has(id) || seen.has(id)) continue
        visible.push(id)
        seen.add(id)
      }
      for (const id of locked) {
        if (!seen.has(id) && valid.has(id)) {
          visible.push(id)
          seen.add(id)
        }
      }
      if (!visible.length) return prev
      const rest = resolved.order.filter((id) => !seen.has(id))
      const next = {
        ...resolved,
        order: pinActionsLast([...visible, ...rest]),
        hidden: rest.filter((id) => !locked.has(id)),
      }
      if (samePrefs(prev, next)) return prev
      writePrefs(next)
      return next
    })
  }, [writePrefs])

  const makeDefaultColumns = useCallback(async () => {
    if (!tableId || !isOrgAdmin) return false
    setMakingDefault(true)
    try {
      const next = resolveColumnPrefs(prefs, columnDefsRef.current)
      const saved = await saveTableColumnDefault(tableId, {
        order: next.order,
        hidden: next.hidden,
        known: next.known,
      })
      const version = Number(saved?.version) || 1
      setOrgDefault({ prefs: next, version })
      const key = storageKeyRef.current
      if (key) saveTableColumnPrefs(key, withOrgVersion(next, version))
      setPrefs(next)
      return true
    } finally {
      setMakingDefault(false)
    }
  }, [tableId, isOrgAdmin, prefs])

  return {
    columnDefs,
    columnOrder: prefs.order,
    visibleColumnIds,
    isVisible,
    toggleColumn,
    resetColumns,
    reorderColumns,
    moveColumn,
    saveColumns,
    applyVisibleOrder,
    makeDefaultColumns: isOrgAdmin ? makeDefaultColumns : undefined,
    makingDefault,
    canMakeDefault: Boolean(isOrgAdmin && tableId),
    prefsReady: Boolean(loadedKey),
  }
}
