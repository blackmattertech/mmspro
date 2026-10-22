import { useState, useEffect, useCallback } from 'react'
import { getEmployees, createEmployee, updateEmployee, deleteEmployee } from '../lib/api-employees'
import { fetchReferenceData, invalidateReferenceCache, peekCachedList, peekReferenceData, PICKER_LIMIT } from '../lib/referenceDataCache'

export function useEmployees(filters = {}) {
  const {
    departmentId,
    locationId,
    forAssignment = false,
    search,
    limit = PICKER_LIMIT,
    offset = 0,
    enabled = true,
    listFilters,
  } = filters
  const filterKey = JSON.stringify(listFilters || {})
  const initial = peekCachedList('employees', { departmentId, locationId, forAssignment, search, limit, offset, filters: filterKey })
  const [employees, setEmployees] = useState(() => initial?.items || [])
  const [total, setTotal] = useState(() => initial?.total || 0)
  const [loading, setLoading] = useState(() => !initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!enabled) {
      setEmployees([])
      setTotal(0)
      setLoading(false)
      return
    }
    const cacheParams = { departmentId, locationId, forAssignment, search, limit, offset, filters: filterKey }
    if (!silent && !peekReferenceData('employees', cacheParams)) setLoading(true)
    setError(null)
    try {
      const data = await fetchReferenceData(
        'employees',
        cacheParams,
        () => getEmployees({
          departmentId,
          locationId,
          forAssignment,
          search,
          limit,
          offset,
          filters: listFilters,
        }),
        { force },
      )
      setEmployees(data)
      setTotal(data.total ?? data.length)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [departmentId, locationId, forAssignment, search, limit, offset, enabled, filterKey])

  useEffect(() => {
    load()
  }, [load])

  const reload = useCallback(async (opts = {}) => {
    invalidateReferenceCache('employees')
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
      const data = await createEmployee(payload)
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
      const data = await updateEmployee(id, payload)
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
      await deleteEmployee(id)
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
      await updateEmployee(id, { is_active: isActive })
      await refreshAfterMutation()
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  return { employees, total, loading, saving, error, create, update, remove, toggleActive, reload }
}
