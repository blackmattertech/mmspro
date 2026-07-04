import { useState, useEffect, useCallback } from 'react'
import {
  getAssetFields,
  createAssetField,
  updateAssetField,
  deleteAssetField,
  reorderAssetSections,
} from '../lib/api-assets'

export function useAssetFields() {
  const [fields, setFields] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await getAssetFields()
      setFields(data)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const create = async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const data = await createAssetField(payload)
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
      const data = await updateAssetField(id, payload)
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
      await deleteAssetField(id)
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
      await updateAssetField(id, { is_active: isActive })
      await load({ silent: true })
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  const reorderSections = async (ids) => {
    setSaving(true)
    setError(null)
    try {
      const data = await reorderAssetSections(ids)
      setFields(data)
      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  const sections = fields.filter((f) => f.kind === 'section' && f.is_active !== false)
  const parents = fields.filter((f) => f.kind === 'parent' && f.is_active !== false)

  return {
    fields,
    sections,
    parents,
    loading,
    saving,
    error,
    create,
    update,
    remove,
    toggleActive,
    reorderSections,
    reload: load,
  }
}
