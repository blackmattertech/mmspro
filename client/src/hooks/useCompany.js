import { useState, useEffect, useCallback } from 'react'
import { getCompanyDetails, updateCompanyDetails } from '../lib/api'

export function useCompanyDetails() {
  const [company, setCompany] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getCompanyDetails()
      setCompany(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = async (updates) => {
    setSaving(true)
    setError(null)
    try {
      const data = await updateCompanyDetails(updates)
      setCompany(data)
      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  return { company, loading, saving, error, save, reload: load }
}
