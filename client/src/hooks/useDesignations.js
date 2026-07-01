import { useState, useEffect, useCallback } from 'react'
import {
  getDesignations,
  createDesignation,
  updateDesignation,
  reorderDesignations,
  deleteDesignation,
} from '../lib/api'

export function useDesignations(departmentFilter = '') {
  const [designations, setDesignations] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await getDesignations(departmentFilter || undefined)
      setDesignations(data)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [departmentFilter])

  useEffect(() => {
    load()
  }, [load])

  const create = async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const data = await createDesignation(payload)
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
      const data = await updateDesignation(id, payload)
      await load({ silent: true })
      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  const reorder = async (ids) => {
    setError(null)
    try {
      const data = await reorderDesignations(ids)
      setDesignations(data)
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  const remove = async (id) => {
    setSaving(true)
    setError(null)
    try {
      await deleteDesignation(id)
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
      await updateDesignation(id, { is_active: isActive })
      await load({ silent: true })
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  const setHierarchy = async (id, hierarchy) => {
    setError(null)
    try {
      await updateDesignation(id, { hierarchy })
      await load({ silent: true })
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  return {
    designations,
    loading,
    saving,
    error,
    create,
    update,
    remove,
    reorder,
    toggleActive,
    setHierarchy,
    reload: load,
  }
}
