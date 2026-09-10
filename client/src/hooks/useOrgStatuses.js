import { useCallback, useEffect, useState } from 'react'
import {
  createOrgStatus,
  deleteOrgStatus,
  getOrgStatuses,
  reorderOrgStatuses,
  resetOrgStatuses,
  updateOrgStatus,
} from '../lib/api-org-statuses'

export function useOrgStatuses(entityType, { includeInactive = true } = {}) {
  const [statuses, setStatuses] = useState([])
  const [loading, setLoading] = useState(Boolean(entityType))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const reload = useCallback(async () => {
    if (!entityType) {
      setStatuses([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const rows = await getOrgStatuses(entityType, { includeInactive })
      setStatuses(Array.isArray(rows) ? rows : [])
    } catch (err) {
      setError(err.message || 'Could not load statuses')
      setStatuses([])
    } finally {
      setLoading(false)
    }
  }, [entityType, includeInactive])

  useEffect(() => {
    reload()
  }, [reload])

  const run = async (fn) => {
    setSaving(true)
    setError(null)
    try {
      const result = await fn()
      await reload()
      return result
    } catch (err) {
      setError(err.message || 'Request failed')
      throw err
    } finally {
      setSaving(false)
    }
  }

  return {
    statuses,
    loading,
    error,
    saving,
    reload,
    create: (data) => run(() => createOrgStatus(entityType, data)),
    update: (id, data) => run(() => updateOrgStatus(entityType, id, data)),
    remove: (id) => run(() => deleteOrgStatus(entityType, id)),
    reorder: (ids) => run(() => reorderOrgStatuses(entityType, ids)),
    reset: () => run(() => resetOrgStatuses(entityType)),
  }
}
