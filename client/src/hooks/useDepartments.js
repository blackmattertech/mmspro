import { useState, useEffect, useCallback } from 'react'
import { getDepartments, createDepartment, updateDepartment, deleteDepartment } from '../lib/api'

export function useDepartments(locationFilter = '') {
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await getDepartments(locationFilter || undefined)
      setDepartments(data)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [locationFilter])

  useEffect(() => {
    load()
  }, [load])

  const create = async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const data = await createDepartment(payload)
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
      const data = await updateDepartment(id, payload)
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
      await deleteDepartment(id)
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
      await updateDepartment(id, { is_active: isActive })
      await load({ silent: true })
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  return { departments, loading, saving, error, create, update, remove, toggleActive, reload: load }
}
