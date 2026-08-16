import { useState, useEffect, useCallback } from 'react'
import { getEmployees, createEmployee, updateEmployee, deleteEmployee } from '../lib/api-employees'
import { fetchReferenceData, invalidateReferenceCache } from '../lib/referenceDataCache'

export function useEmployees(filters = {}) {
  const { departmentId, locationId, forAssignment = false } = filters
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await fetchReferenceData(
        'employees',
        { departmentId, locationId, forAssignment },
        () => getEmployees({ departmentId, locationId, forAssignment }),
        { force },
      )
      setEmployees(data)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [departmentId, locationId, forAssignment])

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

  return { employees, loading, saving, error, create, update, remove, toggleActive, reload: load }
}
