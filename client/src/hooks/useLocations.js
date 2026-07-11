import { useState, useEffect, useCallback } from 'react'
import { getLocations, createLocation, updateLocation, deleteLocation } from '../lib/api'

export function useLocations({ forAssignment = false } = {}) {
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await getLocations({ forAssignment })
      setLocations(data)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [forAssignment])

  useEffect(() => {
    load()
  }, [load])

  const create = async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const data = await createLocation(payload)
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
      const data = await updateLocation(id, payload)
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
      await deleteLocation(id)
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
      await updateLocation(id, { is_active: isActive })
      await load({ silent: true })
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  return { locations, loading, saving, error, create, update, remove, toggleActive, reload: load }
}
