import { apiFetch } from './api'
import { asListArray } from './listResponse'
import { PICKER_LIMIT, seedReferenceData } from './referenceDataCache'

const EMPTY_LIST_PARAMS = {
  search: undefined,
  limit: PICKER_LIMIT,
  offset: 0,
}

let inflight = null

function seedList(namespace, params, items) {
  seedReferenceData(namespace, params, asListArray({ items: items || [], total: (items || []).length }))
}

function applyBootstrap(payload) {
  if (!payload || typeof payload !== 'object') return payload

  seedList('locations', {
    forAssignment: false,
    ...EMPTY_LIST_PARAMS,
    filters: '{}',
    sort: undefined,
    sortDir: undefined,
  }, payload.locations)

  seedList('departments', {
    locationFilter: '',
    ...EMPTY_LIST_PARAMS,
    filters: '{}',
  }, payload.departments)

  seedList('work-centers', {
    locationId: undefined,
    ...EMPTY_LIST_PARAMS,
    filters: '{}',
  }, payload.work_centers)

  seedReferenceData('catalog-fields', {}, { fields: payload.catalog_fields || [] })

  const statuses = payload.org_statuses || {}
  for (const [entityType, rows] of Object.entries(statuses)) {
    seedReferenceData('org-statuses', { entityType }, rows || [])
  }

  if (payload.tab_counts?.work_requests) {
    seedReferenceData('tab-counts', { module: 'work_requests' }, payload.tab_counts.work_requests)
  }
  if (payload.tab_counts?.work_orders) {
    seedReferenceData('tab-counts', { module: 'work_orders' }, payload.tab_counts.work_orders)
  }

  return payload
}

export function loadOrgBootstrap() {
  if (!inflight) {
    inflight = apiFetch('/api/bootstrap')
      .then(applyBootstrap)
      .catch((err) => {
        inflight = null
        throw err
      })
  }
  return inflight
}
