/**
 * Forms a company checklist can be offered on.
 * Keep form ids in sync with server/lib/checklistService.js CHECKLIST_FORMS.
 */
export const CHECKLIST_FORMS = [
  { formId: 'work_request.create', label: 'Work request', moduleKey: 'work_request', moduleId: 'work_request' },
  { formId: 'work_orders.manual', label: 'Manual work order', moduleKey: 'work_order', moduleId: 'work_orders' },
  { formId: 'pm.plan', label: 'PM plan', moduleKey: 'pm_plan', moduleId: 'work_orders_scheduled' },
]

const BY_ID = new Map(CHECKLIST_FORMS.map((item) => [item.formId, item]))
const BY_MODULE = new Map(CHECKLIST_FORMS.map((item) => [item.moduleKey, item.formId]))

export function checklistFormLabel(formId) {
  return BY_ID.get(formId)?.label || formId
}

export function formIdsFromChecklist(row) {
  const stored = Array.isArray(row?.form_ids)
    ? row.form_ids.filter((id) => BY_ID.has(id))
    : []
  if (stored.length) return stored
  const fallback = BY_MODULE.get(row?.module_key)
  return fallback ? [fallback] : []
}

export function checklistFormLabels(row) {
  const labels = formIdsFromChecklist(row).map(checklistFormLabel)
  return labels.length ? labels.join(', ') : '—'
}
