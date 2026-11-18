import { apiFetch } from './api'

export function listRecordTemplates(moduleKey) {
  const params = new URLSearchParams({ module_key: moduleKey })
  return apiFetch(`/api/record-templates?${params}`)
}

export function getRecordTemplate(id) {
  return apiFetch(`/api/record-templates/${id}`)
}

export function applyRecordTemplate(id) {
  return apiFetch(`/api/record-templates/${id}/apply`)
}

export function createRecordTemplate(body) {
  return apiFetch('/api/record-templates', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function renameRecordTemplate(id, name) {
  return apiFetch(`/api/record-templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

export function deleteRecordTemplate(id) {
  return apiFetch(`/api/record-templates/${id}`, { method: 'DELETE' })
}
