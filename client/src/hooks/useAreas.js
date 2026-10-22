import { useState, useEffect, useCallback } from 'react'
import { getAreas, createArea, updateArea, deleteArea } from '../lib/api'
import { fetchReferenceData, invalidateReferenceCache, peekCachedList, peekReferenceData, PICKER_LIMIT } from '../lib/referenceDataCache'

export function useAreas({
  locationId,
  departmentId,
  search,
  limit = PICKER_LIMIT,
  offset = 0,
  enabled = true,
  filters,
} = {}) {
  const filterKey = JSON.stringify(filters || {})
  const initial = peekCachedList('areas', { locationId, departmentId, search, limit, offset, filters: filterKey })
  const [areas, setAreas] = useState(() => initial?.items || [])
  const [total, setTotal] = useState(() => initial?.total || 0)
  const [loading, setLoading] = useState(() => !initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!enabled) {
      setAreas([])
      setTotal(0)
      setLoading(false)
      return
    }
    const cacheParams = { locationId, departmentId, search, limit, offset, filters: filterKey }
    if (!silent && !peekReferenceData('areas', cacheParams)) setLoading(true)
    setError(null)
    try {
      const data = await fetchReferenceData(
        'areas',
        cacheParams,
        () => getAreas({ locationId, departmentId, search, limit, offset, filters }),
        { force },
      )
      setAreas(data)
      setTotal(data.total ?? data.length)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [locationId, departmentId, search, limit, offset, enabled, filterKey])

  useEffect(() => {
    load()
  }, [load])

  const refreshAfterMutation = async () => {
    invalidateReferenceCache('areas')
    await load({ silent: true, force: true })
  }

  const create = async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const data = await createArea(payload)
      await refreshAfterMutation()
      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  const update = async (id, payload) => {
    setSaving(true)
    setError(null)
    try {
      const data = await updateArea(id, payload)
      await refreshAfterMutation()
      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id) => {
    setSaving(true)
    setError(null)
    try {
      await deleteArea(id)
      await refreshAfterMutation()
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (id, isActive) => {
    setError(null)
    try {
      await updateArea(id, { is_active: isActive })
      await refreshAfterMutation()
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  return { areas, total, loading, saving, error, create, update, remove, toggleActive, reload: load }
}
