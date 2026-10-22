import { useCallback, useMemo, useState } from 'react'
import { useDebouncedValue } from './useDebouncedValue'

function cleanFilters(filters) {
  const next = {}
  for (const [key, value] of Object.entries(filters || {})) {
    const text = String(value ?? '').trim()
    if (text) next[key] = text
  }
  return next
}

/**
 * Shared search, column filters, header sort, and status-pill selection.
 * excludeStatuses applies only when no status pill is selected.
 */
export function useListControls({ excludeStatuses = [] } = {}) {
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({})
  const [sort, setSort] = useState(null)
  const [statuses, setStatuses] = useState([])
  const debouncedSearch = useDebouncedValue(search.trim())
  const filterKey = JSON.stringify(cleanFilters(filters))
  const debouncedFilterKey = useDebouncedValue(filterKey)
  const debouncedFilters = useMemo(
    () => JSON.parse(debouncedFilterKey || '{}'),
    [debouncedFilterKey],
  )
  const excludeKey = (excludeStatuses || []).join(',')

  const setColumnFilter = useCallback((columnId, value) => {
    setFilters((prev) => {
      const next = { ...prev }
      const text = String(value ?? '')
      if (!text.trim()) delete next[columnId]
      else next[columnId] = text
      return next
    })
  }, [])

  const toggleStatus = useCallback((key) => {
    setStatuses((prev) => (
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    ))
  }, [])

  const query = useMemo(() => ({
    search: debouncedSearch,
    filters: debouncedFilters,
    sort: sort?.id || '',
    sortDir: sort?.dir || '',
    statuses,
    excludeStatuses: statuses.length ? [] : excludeKey.split(',').filter(Boolean),
  }), [debouncedSearch, debouncedFilters, sort, statuses, excludeKey])

  const resetKey = `${debouncedSearch}|${JSON.stringify(debouncedFilters)}|${sort?.id || ''}|${sort?.dir || ''}|${statuses.join(',')}`

  return {
    search,
    setSearch,
    filters,
    setFilters,
    setColumnFilter,
    sort,
    setSort,
    statuses,
    toggleStatus,
    query,
    resetKey,
  }
}
