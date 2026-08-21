import { useState, useEffect, useCallback } from 'react'
import {
  getWorkCenters,
  createWorkCenter,
  updateWorkCenter,
  deleteWorkCenter,
} from '../lib/api'
import { fetchReferenceData, invalidateReferenceCache } from '../lib/referenceDataCache'

export function useWorkCenters({ locationId, search, limit = 200, offset = 0 } = {}) {
  const [workCenters, setWorkCenters] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await fetchReferenceData(
        'work-centers',
        { locationId, search, limit, offset },
        () => getWorkCenters({ locationId, search, limit, offset }),
        { force },
      )
      setWorkCenters(data)
      setTotal(data.total ?? data.length)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [locationId, search, limit, offset])

  useEffect(() => {
    load()
  }, [load])

  const refreshAfterMutation = async () => {
    invalidateReferenceCache('work-centers')
    await load({ silent: true, force: true })
  }

  const create = async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const data = await createWorkCenter(payload)
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
      const data = await updateWorkCenter(id, payload)
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
      await deleteWorkCenter(id)
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
      await updateWorkCenter(id, { is_active: isActive })
      await refreshAfterMutation()
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  return {
    workCenters,
    total,
    loading,
    saving,
    error,
    create,
    update,
    remove,
    toggleActive,
    reload: load,
  }
}
