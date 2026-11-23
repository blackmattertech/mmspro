import { apiFetch } from './api'

export function getStatusFilterEntityTypes() {
  return apiFetch('/api/status-filters/entity-types')
}

export function getStatusFilters() {
  return apiFetch('/api/status-filters')
}

export function getStatusFilterModule(entityType) {
  return apiFetch(`/api/status-filters/${encodeURIComponent(entityType)}`)
}

export function saveStatusFilterMappings(entityType, mappings) {
  return apiFetch(`/api/status-filters/${encodeURIComponent(entityType)}`, {
    method: 'PUT',
    body: JSON.stringify({ mappings }),
  })
}

export function resetStatusFilterMappings(entityType) {
  return apiFetch(`/api/status-filters/${encodeURIComponent(entityType)}/reset`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}
