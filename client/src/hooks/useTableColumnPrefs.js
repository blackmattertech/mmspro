import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './useAuth'
import { useOrg } from './useOrg'
import {
  buildTableColumnStorageKey,
  loadTableColumnPrefs,
  resolveColumnPrefs,
  saveTableColumnPrefs,
  visibleIdsFromPrefs,
} from '../lib/tableColumnPrefs'

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
  return next.join('|') === previousOrder.join('|') ? previousOrder : next
}

/**
 * Per-user, per-org column visibility and order for a table.
 * @param {string} tableId
 * @param {{ id: string, label: string, defaultVisible?: boolean, locked?: boolean }[]} columnDefs
 */
export function useTableColumnPrefs(tableId, columnDefs) {
  const { user } = useAuth()
  const { org } = useOrg()
  const columnsSignature = buildColumnsSignature(columnDefs)

  const [prefs, setPrefs] = useState(() => resolveColumnPrefs(null, columnDefs))
  const [loadedKey, setLoadedKey] = useState(null)

  const storageKey = useMemo(
    () => buildTableColumnStorageKey(org?.id, user?.id, tableId),
    [org?.id, user?.id, tableId],
  )
  const columnDefsRef = useRef(columnDefs)
  const storageKeyRef = useRef(storageKey)
  const loadedKeyRef = useRef(loadedKey)
  columnDefsRef.current = columnDefs
  storageKeyRef.current = storageKey
  loadedKeyRef.current = loadedKey

  const writePrefs = useCallback((next) => {
    const key = storageKeyRef.current
    if (key && loadedKeyRef.current === key) saveTableColumnPrefs(key, next)
  }, [])

  useEffect(() => {
    if (!tableId || !columnDefs.length) {
      setLoadedKey(null)
      return
    }
    const saved = storageKey ? loadTableColumnPrefs(storageKey) : null
    const next = resolveColumnPrefs(saved, columnDefs)
    setPrefs((prev) => (samePrefs(prev, next) ? prev : next))
    setLoadedKey(storageKey ?? `memory:${tableId}`)
  }, [tableId, storageKey, columnsSignature])

  useEffect(() => {
    if (!storageKey || loadedKey !== storageKey) return
    saveTableColumnPrefs(storageKey, prefs)
  }, [storageKey, prefs, loadedKey])

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
    const next = resolveColumnPrefs(null, columnDefsRef.current)
    writePrefs(next)
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
      const hidden = resolved.hidden.filter((id) => id !== columnId)
      const next = { ...resolved, order, hidden }
      writePrefs(next)
      return next
    })
  }, [writePrefs])

  const isVisible = useCallback(
    (columnId) => visibleColumnIds.includes(columnId),
    [visibleColumnIds],
  )

  return {
    columnDefs,
    columnOrder: prefs.order,
    visibleColumnIds,
    isVisible,
    toggleColumn,
    resetColumns,
    reorderColumns,
    moveColumn,
  }
}
