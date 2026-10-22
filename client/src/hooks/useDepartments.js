import { useState, useEffect, useCallback } from 'react'
import { getDepartments, createDepartment, updateDepartment, deleteDepartment } from '../lib/api'
import { fetchReferenceData, invalidateReferenceCache, peekCachedList, peekReferenceData, PICKER_LIMIT } from '../lib/referenceDataCache'

export function useDepartments(locationFilter = '', {
  search,
  limit = PICKER_LIMIT,
  offset = 0,
  enabled = true,
  filters,
} = {}) {
  const filterKey = JSON.stringify(filters || {})
  const initial = peekCachedList('departments', { locationFilter, search, limit, offset, filters: filterKey })
  const [departments, setDepartments] = useState(() => initial?.items || [])
  const [total, setTotal] = useState(() => initial?.total || 0)
  const [loading, setLoading] = useState(() => !initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!enabled) {
      setDepartments([])
      setTotal(0)
      setLoading(false)
      return
    }
    const cacheParams = { locationFilter, search, limit, offset, filters: filterKey }
    if (!silent && !peekReferenceData('departments', cacheParams)) setLoading(true)
    setError(null)
    try {
      const data = await fetchReferenceData(
        'departments',
        cacheParams,
        () => getDepartments(locationFilter || undefined, { search, limit, offset, filters }),
        { force },
      )
      setDepartments(data)
      setTotal(data.total ?? data.length)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [locationFilter, search, limit, offset, enabled, filterKey])

  useEffect(() => {
    load()
  }, [load])

  const reload = useCallback(async (opts = {}) => {
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
      const data = await createDepartment(payload)
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
      const data = await updateDepartment(id, payload)
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
      await deleteDepartment(id)
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
      await updateDepartment(id, { is_active: isActive })
      await refreshAfterMutation()
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  return { departments, total, loading, saving, error, create, update, remove, toggleActive, reload }
}
