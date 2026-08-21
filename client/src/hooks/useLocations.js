import { useState, useEffect, useCallback } from 'react'
import { getLocations, createLocation, updateLocation, deleteLocation } from '../lib/api'
import { fetchReferenceData, invalidateReferenceCache } from '../lib/referenceDataCache'

export function useLocations({ forAssignment = false, search, limit = 200, offset = 0, enabled = true } = {}) {
  const [locations, setLocations] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!enabled) {
      setLocations([])
      setTotal(0)
      setLoading(false)
      return
    }
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await fetchReferenceData(
        'locations',
        { forAssignment, search, limit, offset },
        () => getLocations({ forAssignment, search, limit, offset }),
        { force },
      )
      setLocations(data)
      setTotal(data.total ?? data.length)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [forAssignment, search, limit, offset, enabled])

  useEffect(() => {
    load()
  }, [load])

  const refreshAfterMutation = async () => {
    invalidateReferenceCache('locations')
    invalidateReferenceCache('departments')
    await load({ silent: true, force: true })
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

  return { locations, total, loading, saving, error, create, update, remove, toggleActive, reload: load }
}
