import { apiFetch, apiFetchBlob } from './api'
import { asListArray, listQueryParams } from './listResponse'

function pmFetch(path, options) {
  return apiFetch(`/api/pm${path}`, options)
}

export function getPmActivityTypes({ includeInactive = false } = {}) {
  return pmFetch(`/activity-types${listQueryParams({ include_inactive: includeInactive ? '1' : undefined })}`)
}

export function createPmActivityType(data) {
  return pmFetch('/activity-types', { method: 'POST', body: JSON.stringify(data) })
}

export function updatePmActivityType(id, data) {
  return pmFetch(`/activity-types/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deletePmActivityType(id) {
  return pmFetch(`/activity-types/${id}`, { method: 'DELETE' })
}

export function getChecklistTemplates({ includeInactive = false, moduleKey, formId } = {}) {
  return pmFetch(`/checklists${listQueryParams({
    include_inactive: includeInactive ? '1' : undefined,
    module_key: moduleKey || undefined,
    form_id: formId || undefined,
  })}`)
}

export function getChecklistTemplate(id) {
  return pmFetch(`/checklists/${id}`)
}

export function createChecklistTemplate(data) {
  return pmFetch('/checklists', { method: 'POST', body: JSON.stringify(data) })
}

export function updateChecklistTemplate(id, data) {
  return pmFetch(`/checklists/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deleteChecklistTemplate(id) {
  return pmFetch(`/checklists/${id}`, { method: 'DELETE' })
}

export function createChecklistField(templateId, data) {
  return pmFetch(`/checklists/${templateId}/fields`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateChecklistField(templateId, fieldId, data) {
  return pmFetch(`/checklists/${templateId}/fields/${fieldId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteChecklistField(templateId, fieldId) {
  return pmFetch(`/checklists/${templateId}/fields/${fieldId}`, { method: 'DELETE' })
}

export function reorderChecklistFields(templateId, fieldIds) {
  return pmFetch(`/checklists/${templateId}/fields/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ field_ids: fieldIds }),
  })
}

export function createChecklistSection(templateId, data) {
  return pmFetch(`/checklists/${templateId}/sections`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export function updateChecklistSection(templateId, sectionId, data) {
  return pmFetch(`/checklists/${templateId}/sections/${sectionId}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function deleteChecklistSection(templateId, sectionId) {
  return pmFetch(`/checklists/${templateId}/sections/${sectionId}`, { method: 'DELETE' })
}

export function reorderChecklistSections(templateId, sectionIds) {
  return pmFetch(`/checklists/${templateId}/sections/reorder`, {
    method: 'PUT',
    body: JSON.stringify({ section_ids: sectionIds }),
  })
}

export function getPmTabCounts() {
  return pmFetch('/tab-counts')
}

export async function getPmPlans(params = {}) {
  const data = await pmFetch(`/plans${listQueryParams({
    status: params.status,
    search: params.search,
    limit: params.limit ?? 100,
    offset: params.offset ?? 0,
    filters: params.filters,
  })}`)
  return asListArray(data)
}

export function getPmPlan(id) {
  return pmFetch(`/plans/${id}`)
}

export function createPmPlan(data) {
  return pmFetch('/plans', { method: 'POST', body: JSON.stringify(data) })
}

export function updatePmPlan(id, data) {
  return pmFetch(`/plans/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export function deletePmPlan(id) {
  return pmFetch(`/plans/${id}`, { method: 'DELETE' })
}

export function duplicatePmPlan(id) {
  return pmFetch(`/plans/${id}/duplicate`, { method: 'POST' })
}

export function generatePmWorkOrder(id) {
  return pmFetch(`/plans/${id}/generate`, { method: 'POST' })
}

export function exportPmPlans(params = {}) {
  return apiFetchBlob(`/api/pm/plans${listQueryParams({
    search: params.search,
    filters: params.filters,
    exportCsv: true,
    limit: 5000,
    offset: 0,
  })}`)
}

export function getPmPlansTemplate() {
  return pmFetch('/plans/template')
}

export function bulkUploadPmPlans(base64Data) {
  return pmFetch('/plans/import', {
    method: 'POST',
    body: JSON.stringify({ data: base64Data }),
  })
}
