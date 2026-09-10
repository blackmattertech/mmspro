import { useEffect, useMemo, useState } from 'react'
import { getOrgStatuses } from '../lib/api-org-statuses'

/**
 * Load active org statuses for dropdowns / labels.
 * Falls back to empty until loaded; callers may keep hardcoded fallbacks.
 */
export function useOrgStatusOptions(entityType, { includeInactive = false } = {}) {
  const [statuses, setStatuses] = useState([])
  const [loading, setLoading] = useState(Boolean(entityType))

  useEffect(() => {
    if (!entityType) {
      setStatuses([])
      setLoading(false)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    getOrgStatuses(entityType, { includeInactive })
      .then((rows) => {
        if (!cancelled) setStatuses(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancelled) setStatuses([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [entityType, includeInactive])

  const options = useMemo(
    () => statuses
      .filter((row) => includeInactive || row.is_active !== false)
      .map((row) => ({
        value: entityType === 'task' ? row.id : row.key,
        label: row.name,
        color: row.color,
        is_terminal: row.is_terminal,
        raw: row,
      })),
    [statuses, entityType, includeInactive],
  )

  const labelByKey = useMemo(() => {
    const map = {}
    for (const opt of options) map[opt.value] = opt.label
    return map
  }, [options])

  return { statuses, options, labelByKey, loading }
}
