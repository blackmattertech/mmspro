import { useState, useEffect, useCallback } from 'react'
import { getAreas, createArea, updateArea, deleteArea } from '../lib/api'

export function useAreas({ locationId, departmentId } = {}) {
  const [areas, setAreas] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await getAreas({ locationId, departmentId })
      setAreas(data)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [locationId, departmentId])

  useEffect(() => {
    load()
  }, [load])

  const create = async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const data = await createArea(payload)
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
      const data = await updateArea(id, payload)
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
      await deleteArea(id)
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
      await updateArea(id, { is_active: isActive })
      await load({ silent: true })
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  return { areas, loading, saving, error, create, update, remove, toggleActive, reload: load }
}
