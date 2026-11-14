import { useState, useEffect, useCallback } from 'react'
import {
  getUoms,
  createUom,
  updateUom,
  deleteUom,
} from '../lib/api'
import { fetchReferenceData, invalidateReferenceCache, peekCachedList, peekReferenceData } from '../lib/referenceDataCache'

export function useUoms({
  search,
  limit = 50,
  offset = 0,
  activeOnly = false,
  enabled = true,
  filters,
  sort,
  sortDir,
} = {}) {
  const filterKey = JSON.stringify(filters || {})
  const cacheParams = { search, limit, offset, activeOnly, filters: filterKey, sort, sortDir }
  const initial = peekCachedList('uoms', cacheParams)
  const [uoms, setUoms] = useState(() => initial?.items || [])
  const [total, setTotal] = useState(() => initial?.total || 0)
  const [loading, setLoading] = useState(() => enabled && !initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!enabled) {
      setUoms([])
      setTotal(0)
      setLoading(false)
      return
    }
    if (!silent && !peekReferenceData('uoms', cacheParams)) setLoading(true)
    setError(null)
    try {
      const data = await fetchReferenceData(
        'uoms',
        { search, limit, offset, activeOnly, filters: filterKey, sort, sortDir },
        () => getUoms({ search, limit, offset, activeOnly, filters, sort, sortDir }),
        { force },
      )
      setUoms(data)
      setTotal(data.total ?? data.length)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [search, limit, offset, activeOnly, enabled, filterKey, sort, sortDir, filters])

  useEffect(() => {
    load()
  }, [load])

  const refreshAfterMutation = async () => {
    invalidateReferenceCache('uoms')
    await load({ silent: true, force: true })
  }

  const create = async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const data = await createUom(payload)
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
      const data = await updateUom(id, payload)
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
      await deleteUom(id)
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
      await updateUom(id, { is_active: isActive })
      await refreshAfterMutation()
    } catch (err) {
      setError(err.message)
      throw err
    }
  }

  return {
    uoms,
    total,
    loading,
    saving,
    error,
    create,
    update,
    remove,
    toggleActive,
    reload: load,
  }
}
