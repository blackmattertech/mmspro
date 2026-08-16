import { useState, useEffect, useCallback } from 'react'
import { getDepartments, createDepartment, updateDepartment, deleteDepartment } from '../lib/api'
import { fetchReferenceData, invalidateReferenceCache } from '../lib/referenceDataCache'

export function useDepartments(locationFilter = '', { search, limit = 200, offset = 0 } = {}) {
  const [departments, setDepartments] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await fetchReferenceData(
        'departments',
        { locationFilter, search, limit, offset },
        () => getDepartments(locationFilter || undefined, { search, limit, offset }),
        { force },
      )
      setDepartments(data)
      setTotal(data.total ?? data.length)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [locationFilter, search, limit, offset])

  useEffect(() => {
    load()
  }, [load])

  const refreshAfterMutation = async () => {
    invalidateReferenceCache('departments')
    await load({ silent: true, force: true })
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

  return { departments, total, loading, saving, error, create, update, remove, toggleActive, reload: load }
}
