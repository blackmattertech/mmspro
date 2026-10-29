import { adminFetch } from './api'

export function getAdminDefaultForms() {
  return adminFetch('/defaults/forms')
}

export function markAdminDefaultForm(formId, sourceOrgId) {
  return adminFetch('/defaults/forms', {
    method: 'POST',
    body: JSON.stringify({ form_id: formId, source_org_id: sourceOrgId }),
  })
}

export function getAdminDefaultHierarchies() {
  return adminFetch('/defaults/hierarchies')
}

export function markAdminDefaultHierarchy(sourceOrgId) {
  return adminFetch('/defaults/hierarchies', {
    method: 'POST',
    body: JSON.stringify({ source_org_id: sourceOrgId }),
  })
}
