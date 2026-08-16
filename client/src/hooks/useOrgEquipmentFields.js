import { useState, useEffect, useCallback } from 'react'
import { getEquipmentFields, updateEquipmentFieldDropdown } from '../lib/api-equipment'
import { apiFetch } from '../lib/api'

export function useOrgEquipmentFields({ enabled = true } = {}) {
  const [fields, setFields] = useState([])
  const [loading, setLoading] = useState(Boolean(enabled))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!enabled) {
      setFields([])
      setLoading(false)
      return
    }
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await getEquipmentFields()
      setFields(data)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    load()
  }, [load])

  const update = async (id, payload) => {
    setSaving(true)
    setError(null)
    try {
      let data
      if (payload.dropdown_options !== undefined && Object.keys(payload).length === 1) {
        data = await updateEquipmentFieldDropdown(id, payload.dropdown_options)
      } else if (payload.is_active !== undefined && Object.keys(payload).length === 1) {
        data = await apiFetch(`/api/equipment-fields/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_active: payload.is_active }),
        })
      } else {
        throw new Error('Only option values can be updated here')
      }
      await load({ silent: true })
      return data
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  const create = async () => {
    throw new Error('Equipment field schema is managed from the Super Admin panel')
  }
  const remove = async () => {
    throw new Error('Equipment field schema is managed from the Super Admin panel')
  }
  const toggleActive = async (id, isActive) => update(id, { is_active: isActive })
  const reorderSections = async () => {
    throw new Error('Section layout is managed from the Super Admin panel')
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
