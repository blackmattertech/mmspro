import { useEffect, useMemo, useState } from 'react'
import { getOrgStatuses } from '../lib/api-org-statuses'
import { fetchReferenceData, peekReferenceData } from '../lib/referenceDataCache'

/**
 * Load org statuses for dropdowns / labels.
 * One cached fetch includes inactive rows; callers can still hide them.
 */
export function useOrgStatusOptions(entityType, { includeInactive = false } = {}) {
  const cached = entityType ? peekReferenceData('org-statuses', { entityType }) : null
  const [statuses, setStatuses] = useState(() => (Array.isArray(cached) ? cached : []))
  const [loading, setLoading] = useState(() => Boolean(entityType) && !cached)

  useEffect(() => {
    if (!entityType) {
      setStatuses([])
      setLoading(false)
      return undefined
    }
    let cancelled = false
    const existing = peekReferenceData('org-statuses', { entityType })
    if (!existing) setLoading(true)
    fetchReferenceData(
      'org-statuses',
      { entityType },
      () => getOrgStatuses(entityType, { includeInactive: true }),
    )
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
  }, [entityType])

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
