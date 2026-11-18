import { apiFetch } from './api'

function formMastersFetch(path, options = {}) {
  return apiFetch(`/api/form-masters${path}`, options)
}

export function encodeFormMasterSegment(value) {
  return encodeURIComponent(String(value || ''))
}

export function getFormMasters() {
  return formMastersFetch('')
}

export function getFormMasterFields(formId) {
  return formMastersFetch(`/${encodeFormMasterSegment(formId)}`)
}

export function getFormMasterField(formId, fieldId) {
  return formMastersFetch(`/${encodeFormMasterSegment(formId)}/${encodeFormMasterSegment(fieldId)}`)
}

/** `clones` marks options created through Duplicate: [{ clone_of_id, label }] (server re-checks). */
export function saveFormMasterOptions(formId, fieldId, options, { clones } = {}) {
  return formMastersFetch(`/${encodeFormMasterSegment(formId)}/${encodeFormMasterSegment(fieldId)}`, {
    method: 'PUT',
    body: JSON.stringify({ options, ...(clones?.length ? { clones } : {}) }),
  })
}

export function saveFormMasterSkips(formId, payload) {
  return formMastersFetch(`/${encodeFormMasterSegment(formId)}/skips`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}
