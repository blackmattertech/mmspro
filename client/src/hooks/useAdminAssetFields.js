import { useState, useEffect, useCallback } from 'react'
import {
  getAdminAssetFields,
  createAdminAssetField,
  updateAdminAssetField,
  deleteAdminAssetField,
  reorderAdminAssetSections,
  reorderAdminAssetParents,
  uploadAdminSectionIcon,
  deleteAdminSectionIcon,
} from '../lib/api-admin-assets'

export function useAdminAssetFields(orgId) {
  const [fields, setFields] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!orgId) {
      setFields([])
      setLoading(false)
      return
    }
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await getAdminAssetFields(orgId)
      setFields(data)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    load()
  }, [load])

  const create = async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const data = await createAdminAssetField(orgId, payload)
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
      const data = await updateAdminAssetField(orgId, id, payload)
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
      await deleteAdminAssetField(orgId, id)
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
      await updateAdminAssetField(orgId, id, { is_active: isActive })
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
      const data = await reorderAdminAssetSections(orgId, ids)
      setFields(data)
      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  const reorderParents = async (sectionId, ids) => {
    setSaving(true)
    setError(null)
    try {
      const data = await reorderAdminAssetParents(orgId, sectionId, ids)
      setFields(data)
      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  const uploadIcon = async (fieldId, file) => {
    setSaving(true)
    setError(null)
    try {
      const data = await uploadAdminSectionIcon(orgId, fieldId, file)
      await load({ silent: true })
      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  const removeIcon = async (fieldId) => {
    setSaving(true)
    setError(null)
    try {
      const data = await deleteAdminSectionIcon(orgId, fieldId)
      await load({ silent: true })
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
    reorderParents,
    uploadIcon,
    removeIcon,
    reload: load,
  }
}
