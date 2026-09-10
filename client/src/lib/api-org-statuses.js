import { apiFetch } from './api'

export function getOrgStatusEntityTypes() {
  return apiFetch('/api/org-statuses/entity-types')
}

export function getOrgStatuses(entityType, { includeInactive = false } = {}) {
  const qs = includeInactive ? '?include_inactive=1' : ''
  return apiFetch(`/api/org-statuses/${encodeURIComponent(entityType)}${qs}`)
}

export function createOrgStatus(entityType, data) {
  return apiFetch(`/api/org-statuses/${encodeURIComponent(entityType)}`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateOrgStatus(entityType, id, data) {
  return apiFetch(`/api/org-statuses/${encodeURIComponent(entityType)}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteOrgStatus(entityType, id) {
  return apiFetch(`/api/org-statuses/${encodeURIComponent(entityType)}/${id}`, {
    method: 'DELETE',
  })
}

export function reorderOrgStatuses(entityType, orderedIds) {
  return apiFetch(`/api/org-statuses/${encodeURIComponent(entityType)}/reorder`, {
    method: 'PATCH',
    body: JSON.stringify({ ordered_ids: orderedIds }),
  })
}

export function resetOrgStatuses(entityType) {
  return apiFetch(`/api/org-statuses/${encodeURIComponent(entityType)}/reset`, {
    method: 'POST',
  })
}
