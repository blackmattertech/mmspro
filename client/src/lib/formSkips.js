import { parseLayoutId } from './formLayoutIds'
import { isWorkOrderProcessForm } from './workOrderForms'

export const PROCESS_TECHNICIAN_ACCEPTANCE = 'technician_acceptance'
export const CLOSEOUT_SECTION_ID = 'system:wo_closeout'

export function isCloseoutSection(sectionOrId) {
  const id = String(sectionOrId?.id || sectionOrId || '')
  return id === CLOSEOUT_SECTION_ID || parseLayoutId(id).value === 'wo_closeout'
}

export function isLayoutFieldSkipped(field) {
  return Boolean(field?.skipped)
}

export function layoutSkipsTechnicianAcceptance(layout, formId) {
  if (formId && !isWorkOrderProcessForm(formId)) return false
  return Boolean(layout?.processSkips?.technician_acceptance)
}
