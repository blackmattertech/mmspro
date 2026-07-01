import { useState, useEffect, useCallback } from 'react'
import { getEmployees, createEmployee, updateEmployee, deleteEmployee } from '../lib/api-employees'

export function useEmployees(filters = {}) {
  const { departmentId, locationId, designationId } = filters
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await getEmployees({ departmentId, locationId, designationId })
      setEmployees(data)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [departmentId, locationId, designationId])

  useEffect(() => {
    load()
  }, [load])

  const create = async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const data = await createEmployee(payload)
      await load({ silent: true })
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
      await load({ silent: true })
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
      await load({ silent: true })
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
      await load({ silent: true })
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  return { employees, loading, saving, error, create, update, remove, toggleActive, reload: load }
}
