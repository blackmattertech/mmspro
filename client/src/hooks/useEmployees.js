import { useState, useEffect, useCallback } from 'react'
import { getEmployees, createEmployee, updateEmployee, deleteEmployee } from '../lib/api-employees'
import { fetchReferenceData, invalidateReferenceCache } from '../lib/referenceDataCache'

export function useEmployees(filters = {}) {
  const {
    departmentId,
    locationId,
    forAssignment = false,
    search,
    limit = 200,
    offset = 0,
    enabled = true,
  } = filters
  const [employees, setEmployees] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!enabled) {
      setEmployees([])
      setTotal(0)
      setLoading(false)
      return
    }
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await fetchReferenceData(
        'employees',
        { departmentId, locationId, forAssignment, search, limit, offset },
        () => getEmployees({ departmentId, locationId, forAssignment, search, limit, offset }),
        { force },
      )
      setEmployees(data)
      setTotal(data.total ?? data.length)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [departmentId, locationId, forAssignment, search, limit, offset, enabled])

  useEffect(() => {
    load()
  }, [load])

  const refreshAfterMutation = async () => {
    invalidateReferenceCache('employees')
    await load({ silent: true, force: true })
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

  return { employees, total, loading, saving, error, create, update, remove, toggleActive, reload: load }
}
