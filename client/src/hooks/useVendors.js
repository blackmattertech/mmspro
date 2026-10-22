import { useState, useEffect, useCallback } from 'react'
import {
  getVendorsList,
  getVendor,
  createVendor,
  updateVendor,
  deleteVendor,
} from '../lib/api-vendors'
import { fetchReferenceData, invalidateReferenceCache, peekReferenceData } from '../lib/referenceDataCache'

export function useVendors(filters = {}) {
  const {
    search,
    limit,
    offset,
    enabled = true,
    listFilters,
  } = filters
  const filterKey = JSON.stringify(listFilters || {})
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!enabled) {
      setItems([])
      setTotal(0)
      setLoading(false)
      return
    }
    const cacheParams = { search, limit, offset, filters: filterKey }
    if (!silent && !peekReferenceData('vendors', cacheParams)) setLoading(true)
    setError(null)
    try {
      const params = { search, limit, offset, filters: listFilters }
      const data = await fetchReferenceData(
        'vendors',
        cacheParams,
        () => getVendorsList(params),
        { force },
      )
      setItems(data)
      setTotal(data.total ?? data.length)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [search, limit, offset, enabled, filterKey])

  useEffect(() => {
    load()
  }, [load])

  const refreshAfterMutation = async () => {
    invalidateReferenceCache('vendors')
    await load({ silent: true, force: true })
  }

  const create = async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const data = await createVendor(payload)
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
      const data = await updateVendor(id, payload)
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
      await deleteVendor(id)
      await refreshAfterMutation()
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  const loadOne = (id) => getVendor(id)

  return { items, total, loading, saving, error, create, update, remove, loadOne, reload: load }
}
