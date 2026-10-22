import { useEffect, useState } from 'react'
import { getLocations, getDepartments, getWorkCenters, getAreas } from '../lib/api'
import { getEmployees } from '../lib/api-employees'
import { getVendorsList } from '../lib/api-vendors'
import { getEquipmentList } from '../lib/api-equipment'
import { getChecklistTemplates, getPmActivityTypes } from '../lib/api-pm'
import { getOrgStatuses } from '../lib/api-org-statuses'
import { statusEntityForForm } from '../lib/formFieldSources'
import { asListArray } from '../lib/listResponse'
import { fetchReferenceData, PICKER_LIMIT } from '../lib/referenceDataCache'

function toOptions(data) {
  return asListArray(data || []).filter((row) => row.is_active !== false)
}

function cacheParams(extra = {}) {
  return { search: undefined, limit: PICKER_LIMIT, offset: 0, ...extra }
}

function loadSource(sourceId, { locationId, departmentId, areaId, formId } = {}) {
  if (sourceId === 'locations') {
    const params = cacheParams({ forAssignment: false, filters: '{}', sort: undefined, sortDir: undefined })
    return fetchReferenceData('locations', params, () => getLocations({ limit: PICKER_LIMIT }))
  }
  if (sourceId === 'departments') {
    const params = cacheParams({ locationFilter: locationId || '', filters: '{}' })
    return fetchReferenceData('departments', params, () => getDepartments(locationId || undefined, { limit: PICKER_LIMIT }))
  }
  if (sourceId === 'employees' || sourceId === 'employees_multi') {
    const params = cacheParams({
      departmentId,
      locationId,
      forAssignment: false,
      filters: '{}',
    })
    return fetchReferenceData('employees', params, () => getEmployees({
      departmentId,
      locationId,
      limit: PICKER_LIMIT,
    }))
  }
  if (sourceId === 'work_centers') {
    const params = cacheParams({ locationId, filters: '{}' })
    return fetchReferenceData('work-centers', params, () => getWorkCenters({ locationId, limit: PICKER_LIMIT }))
  }
  if (sourceId === 'areas') {
    const params = cacheParams({ locationId, departmentId, filters: '{}' })
    return fetchReferenceData('areas', params, () => getAreas({ locationId, departmentId, limit: PICKER_LIMIT }))
  }
  if (sourceId === 'equipment') {
    const params = {
      locationId,
      departmentId,
      areaId,
      search: undefined,
      limit: PICKER_LIMIT,
      offset: 0,
      sortBy: 'name_asc',
      filters: '{}',
    }
    return fetchReferenceData('equipment', params, () => getEquipmentList({
      locationId,
      departmentId,
      areaId,
      limit: PICKER_LIMIT,
    }))
  }
  if (sourceId === 'vendors') {
    const params = cacheParams({ filters: '{}' })
    return fetchReferenceData('vendors', params, () => getVendorsList({ limit: PICKER_LIMIT }))
  }
  if (sourceId === 'checklists') {
    return fetchReferenceData('checklists', {}, () => getChecklistTemplates())
  }
  if (sourceId === 'activity_types') {
    return fetchReferenceData('activity-types', {}, () => getPmActivityTypes())
  }
  if (sourceId === 'statuses') {
    const entityType = statusEntityForForm(formId)
    return fetchReferenceData('org-statuses', { entityType }, () => getOrgStatuses(entityType, { includeInactive: true }))
  }
  return Promise.resolve([])
}

export function useMasterOptions(sourceId, {
  locationId,
  departmentId,
  areaId,
  formId,
  enabled = true,
} = {}) {
  const params = { locationId, departmentId, areaId, formId }
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(() => Boolean(enabled && sourceId))

  useEffect(() => {
    if (!enabled || !sourceId) {
      setOptions([])
      setLoading(false)
      return undefined
    }
    let cancelled = false
    loadSource(sourceId, params)
      .then((data) => {
        if (!cancelled) setOptions(toOptions(data))
      })
      .catch(() => {
        if (!cancelled) setOptions([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [enabled, sourceId, locationId, departmentId, areaId, formId])

  return { options, loading }
}
