import { useState, useEffect, useCallback } from 'react'
import {
  getOrganizations,
  createOrganization,
  updateOrganization,
} from '../lib/api'

export function useAdminOrganizations() {
  const [organizations, setOrganizations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const fetchOrganizations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getOrganizations()
      setOrganizations(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrganizations()
  }, [fetchOrganizations])

  const createOrg = async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const org = await createOrganization(payload)
      setOrganizations((prev) => [org, ...prev])
      return org
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  const toggleOrgStatus = async (id, isActive) => {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateOrganization(id, { is_active: isActive })
      setOrganizations((prev) =>
        prev.map((org) => (org.id === id ? updated : org))
      )
      return updated
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  return {
    organizations,
    loading,
    error,
    saving,
    createOrg,
    toggleOrgStatus,
    refresh: fetchOrganizations,
  }
}
