import { useState, useEffect, useCallback } from 'react'
import {
  getAccessRoles,
  createAccessRole,
  updateAccessRole,
  deleteAccessRole,
  assignEmployeesToRole,
} from '../lib/api-roles'

export function useRoles(locationId = '') {
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await getAccessRoles(locationId || undefined)
      setRoles(data)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [locationId])

  useEffect(() => {
    load()
  }, [load])

  const create = async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const data = await createAccessRole(payload)
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
      const data = await updateAccessRole(id, payload)
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
      await deleteAccessRole(id)
      await load({ silent: true })
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  const assignEmployees = async (id, employeeIds) => {
    setSaving(true)
    setError(null)
    try {
      const data = await assignEmployeesToRole(id, employeeIds)
      await load({ silent: true })
      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  return {
    roles,
    loading,
    saving,
    error,
    create,
    update,
    remove,
    assignEmployees,
    reload: load,
  }
}
