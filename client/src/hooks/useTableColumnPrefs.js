import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from './useAuth'
import { useOrg } from './useOrg'
import {
  buildTableColumnStorageKey,
  loadTableColumnPrefs,
  normalizeVisibleColumns,
  saveTableColumnPrefs,
} from '../lib/tableColumnPrefs'

function buildColumnsSignature(columnDefs) {
  if (!columnDefs?.length) return ''
  return columnDefs
    .map((col) => `${col.id}:${col.defaultVisible === false ? 0 : 1}:${col.locked ? 1 : 0}`)
    .join('|')
}

function sameColumnIds(a, b) {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

/**
 * Per-user, per-org column visibility for a table.
 * @param {string} tableId
 * @param {{ id: string, label: string, defaultVisible?: boolean, locked?: boolean }[]} columnDefs
 */
export function useTableColumnPrefs(tableId, columnDefs) {
  const { user } = useAuth()
  const { org } = useOrg()

  const columnsSignature = buildColumnsSignature(columnDefs)

  const defaultIds = useMemo(
    () => columnDefs
      .filter((col) => col.defaultVisible !== false)
      .map((col) => col.id),
    [columnsSignature],
  )

  const [visibleIds, setVisibleIds] = useState(() => (
    normalizeVisibleColumns(defaultIds, columnDefs)
  ))
  // Only save after prefs for this storageKey have been loaded (avoids clobbering).
  const [loadedKey, setLoadedKey] = useState(null)

  const storageKey = useMemo(
    () => buildTableColumnStorageKey(org?.id, user?.id, tableId),
    [org?.id, user?.id, tableId],
  )

  useEffect(() => {
    if (!tableId || !columnDefs.length) {
      setLoadedKey(null)
      return
    }
    const saved = storageKey ? loadTableColumnPrefs(storageKey) : null
    const next = normalizeVisibleColumns(saved || defaultIds, columnDefs)
    setVisibleIds((prev) => (sameColumnIds(prev, next) ? prev : next))
    setLoadedKey(storageKey ?? `memory:${tableId}`)
  }, [tableId, storageKey, columnsSignature, defaultIds])

  useEffect(() => {
    if (!storageKey || loadedKey !== storageKey) return
    saveTableColumnPrefs(storageKey, visibleIds)
  }, [storageKey, visibleIds, loadedKey])

  const visibleColumnIds = useMemo(
    () => normalizeVisibleColumns(visibleIds, columnDefs),
    [visibleIds, columnsSignature],
  )

  const toggleColumn = useCallback((columnId) => {
    const def = columnDefs.find((col) => col.id === columnId)
    if (!def || def.locked) return

    setVisibleIds((prev) => {
      const current = normalizeVisibleColumns(prev, columnDefs)
      const next = current.includes(columnId)
        ? current.filter((id) => id !== columnId)
        : [...current, columnId]
      return normalizeVisibleColumns(next, columnDefs)
    })
  }, [columnsSignature])

  const resetColumns = useCallback(() => {
    setVisibleIds(normalizeVisibleColumns(defaultIds, columnDefs))
  }, [columnsSignature, defaultIds])

  const isVisible = useCallback(
    (columnId) => visibleColumnIds.includes(columnId),
    [visibleColumnIds],
  )

  return {
    columnDefs,
    visibleColumnIds,
    isVisible,
    toggleColumn,
    resetColumns,
  }
}
