import { useState, useEffect, useCallback } from 'react'
import {
  getEquipmentList,
  getEquipment,
  createEquipment,
  updateEquipment,
  deleteEquipment,
} from '../lib/api-equipment'
import { fetchReferenceData, invalidateReferenceCache, peekReferenceData } from '../lib/referenceDataCache'

export function useEquipment(filters = {}) {
  const {
    locationId,
    departmentId,
    areaId,
    search,
    limit,
    offset,
    filterField,
    filterValue,
    listFilters,
    sortBy,
    enabled = true,
  } = filters
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
    const cacheParams = {
      locationId,
      departmentId,
      areaId,
      search,
      limit,
      offset,
      sortBy: sortBy || 'name_asc',
      filters: JSON.stringify(
        listFilters && Object.keys(listFilters).length
          ? listFilters
          : (filterField && String(filterValue || '').trim()
            ? { [filterField]: String(filterValue).trim() }
            : {}),
      ),
    }
    if (!silent && !peekReferenceData('equipment', cacheParams)) setLoading(true)
    setError(null)
    try {
      const params = {
        locationId,
        departmentId,
        areaId,
        search,
        limit,
        offset,
        sortBy: sortBy || 'name_asc',
        filters: listFilters && Object.keys(listFilters).length
          ? listFilters
          : (filterField && String(filterValue || '').trim()
            ? { [filterField]: String(filterValue).trim() }
            : undefined),
      }
      const data = await fetchReferenceData(
        'equipment',
        cacheParams,
        () => getEquipmentList(params),
        { force },
      )
      setItems(data)
      setTotal(data.total ?? data.length)
    } catch (err) {
      setError(err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [locationId, departmentId, areaId, search, limit, offset, filterField, filterValue, listFilters, sortBy, enabled])

  useEffect(() => {
    load()
  }, [load])

  const refreshAfterMutation = async () => {
    invalidateReferenceCache('equipment')
    await load({ silent: true, force: true })
  }

  const create = async (payload) => {
    setSaving(true)
    setError(null)
    try {
      const data = await createEquipment(payload)
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
      const data = await updateEquipment(id, payload)
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
      await deleteEquipment(id)
      await refreshAfterMutation()
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSaving(false)
    }
  }

  const loadOne = (id) => getEquipment(id)

  return { items, total, loading, saving, error, create, update, remove, loadOne, reload: load }
}
