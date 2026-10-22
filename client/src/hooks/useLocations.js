import { useState, useEffect, useCallback } from 'react'
import { getLocations, createLocation, updateLocation, deleteLocation } from '../lib/api'
import { fetchReferenceData, invalidateReferenceCache, peekCachedList, peekReferenceData, PICKER_LIMIT } from '../lib/referenceDataCache'

export function useLocations({
  forAssignment = false,
  search,
  limit = PICKER_LIMIT,
  offset = 0,
  enabled = true,
  filters,
  sort,
  sortDir,
} = {}) {
  const initial = peekCachedList('locations', {
    forAssignment, search, limit, offset, filters: JSON.stringify(filters || {}), sort, sortDir,
  })
  const [locations, setLocations] = useState(() => initial?.items || [])
  const [total, setTotal] = useState(() => initial?.total || 0)
  const [loading, setLoading] = useState(() => !initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!enabled) {
      setLocations([])
      setTotal(0)
      setLoading(false)
      return
    }
    const cacheParams = { forAssignment, search, limit, offset, filters: JSON.stringify(filters || {}), sort, sortDir }
    if (!silent && !peekReferenceData('locations', cacheParams)) setLoading(true)
    setError(null)
    try {
      const data = await fetchReferenceData(
        'locations',
        cacheParams,
        () => getLocations({ forAssignment, search, limit, offset, filters, sort, sortDir }),
        { force },
      )
      setLocations(data)
      setTotal(data.total ?? data.length)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [forAssignment, search, limit, offset, enabled, filters, sort, sortDir])

  useEffect(() => {
    load()
  }, [load])

  const reload = useCallback(async (opts = {}) => {
    invalidateReferenceCache('locations')
    invalidateReferenceCache('departments')
    await load({ silent: true, force: true, ...opts })
  }, [load])

  const refreshAfterMutation = async () => {
    await reload()
  }

  const create = async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const data = await createLocation(payload)
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
      const data = await updateLocation(id, payload)
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
      await deleteLocation(id)
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
      await updateLocation(id, { is_active: isActive })
      await refreshAfterMutation()
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  return { locations, total, loading, saving, error, create, update, remove, toggleActive, reload }
}
