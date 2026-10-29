/**
 * Work Order process forms (assignment → technician complete).
 * Keep in sync with server/lib/workOrderForms.js.
 */
import { normalizeFilledBy } from './formLayoutIds.js'

export const WORK_ORDER_FORM_IDS = {
  FROM_WORK_REQUEST: 'work_orders.from_work_request',
  FROM_PM: 'work_orders.from_pm',
  MANUAL: 'work_orders.manual',
  USER_SELF: 'work_orders.user_self',
}

export const SOURCE_TYPE_TO_FORM_ID = {
  approved_work_request: WORK_ORDER_FORM_IDS.FROM_WORK_REQUEST,
  breakdown: WORK_ORDER_FORM_IDS.FROM_WORK_REQUEST,
  preventive_maintenance: WORK_ORDER_FORM_IDS.FROM_PM,
  manual: WORK_ORDER_FORM_IDS.MANUAL,
  user_self_request: WORK_ORDER_FORM_IDS.USER_SELF,
}

export const WO_FORM_STAGES = ['create', 'assignment', 'execution', 'closeout']

export const WO_FORM_STAGE_LABELS = {
  create: 'Create',
  assignment: 'Assignment',
  execution: 'Execution',
  closeout: 'Closeout',
}

export const COMPLETION_FALLBACK_FIELDS = [
  ['work_start_at', 'Work start time'],
  ['work_end_at', 'Work end time'],
  ['job_description', 'Detailed job description'],
  ['root_cause', 'Root cause analysis'],
  ['action_taken', 'Action taken'],
  ['material_consumed', 'Material consumed'],
]

const COMPLETION_KEY_LABELS = Object.fromEntries(COMPLETION_FALLBACK_FIELDS)

export function workOrderFormIdForSource(sourceType) {
  return SOURCE_TYPE_TO_FORM_ID[sourceType] || WORK_ORDER_FORM_IDS.MANUAL
}

export function isWorkOrderProcessForm(formId) {
  return String(formId || '').startsWith('work_orders.')
}

/** Registry default is used at runtime when no org/platform layout exists. Manual create still uses live UI until a layout is saved. */
export function shouldFallbackWorkOrderLayout(formId) {
  return formId === WORK_ORDER_FORM_IDS.FROM_WORK_REQUEST
    || formId === WORK_ORDER_FORM_IDS.FROM_PM
    || formId === WORK_ORDER_FORM_IDS.USER_SELF
}

export function normalizeStage(value) {
  const raw = String(value || '').trim()
  return WO_FORM_STAGES.includes(raw) ? raw : ''
}

function filterLayoutBySection(layout, keepSection) {
  if (!layout) return layout
  const sections = (layout.sections || []).filter(keepSection)
  const sectionIds = new Set(sections.map((section) => section.id))
  return {
    ...layout,
    sections,
    fields: (layout.fields || []).filter((field) => sectionIds.has(field.sectionId)),
    groups: (layout.groups || []).filter((group) => sectionIds.has(group.sectionId)),
  }
}

export function layoutForStages(layout, stages, { includeUnstaged = true } = {}) {
  if (!layout || !stages?.length) return layout
  const allowed = new Set([...stages].map(normalizeStage).filter(Boolean))
  return filterLayoutBySection(layout, (section) => {
    const stage = normalizeStage(section.stage)
    if (!stage) return includeUnstaged
    return allowed.has(stage)
  })
}

export function layoutOmittingStages(layout, stages) {
  if (!layout || !stages?.length) return layout
  const blocked = new Set([...stages].map(normalizeStage).filter(Boolean))
  return filterLayoutBySection(layout, (section) => {
    const stage = normalizeStage(section.stage)
    if (!stage) return true
    return !blocked.has(stage)
  })
}

export function lifecycleStagesForStatus(status) {
  if (['completed', 'verified', 'closed'].includes(String(status || ''))) {
    return ['execution', 'closeout']
  }
  return ['execution']
}

function systemKey(field) {
  const id = String(field?.id || '')
  return id.startsWith('system:') ? id.slice('system:'.length) : ''
}

export function layoutHasSystemKey(layout, key) {
  return (layout?.fields || []).some((field) => !field?.skipped && systemKey(field) === key)
}

const NATIVE_KEY_ALIASES = {
  special_instructions: 'assignment_remarks',
  permit_required: 'permit_details',
  permit_types: 'permit_details',
  permit_details: 'permit_details',
  permit_number: 'permit_details',
  permit_issue_at: 'permit_details',
  permit_expiry_at: 'permit_details',
  permit_attachments: 'permit_details',
  work_start_at: 'work_stamps',
  work_end_at: 'work_stamps',
  breakdown_start_at: 'breakdown_times',
  breakdown_end_at: 'breakdown_times',
  execution_attachments: 'execution_files',
  vendor_currency: 'vendor_expense',
  vendor_id: 'vendor_expense',
  checklist_values: 'checklist_execution',
}

const DEFAULT_FILLED_BY_FOR_SYSTEM_KEY = {
  assignee_ids: 'order_to_dept_head',
  work_center: 'order_to_dept_head',
  priority: 'order_to_dept_head',
  planned_start_at: 'order_to_dept_head',
  planned_end_at: 'order_to_dept_head',
  assignment_remarks: 'order_to_dept_head',
  verification_remarks: 'supervisor',
}

export function filledByForNativeKey(layout, nativeKey) {
  const systemKeyName = NATIVE_KEY_ALIASES[nativeKey] || nativeKey
  const field = (layout?.fields || []).find((item) => systemKey(item) === systemKeyName)
  if (field) {
    const section = (layout.sections || []).find((item) => item.id === field.sectionId)
    return normalizeFilledBy(section?.filledBy)
  }
  return DEFAULT_FILLED_BY_FOR_SYSTEM_KEY[systemKeyName] || 'technician'
}

export function requiredSystemKeys(layout) {
  const keys = new Set()
  for (const field of layout?.fields || []) {
    if (field?.skipped || !field?.required) continue
    const key = systemKey(field)
    if (key) keys.add(key)
  }
  return keys
}

/** Required native columns for Complete, derived from the active layout. */
export function completionRequiredFromLayout(layout) {
  if (!layout?.fields?.length) return COMPLETION_FALLBACK_FIELDS

  const fields = []
  const seen = new Set()
  const push = (key, label) => {
    if (seen.has(key)) return
    seen.add(key)
    fields.push([key, label])
  }

  for (const field of layout.fields) {
    if (field?.skipped) continue
    const key = systemKey(field)
    if (!key) continue
    if (key === 'work_stamps') {
      push('work_start_at', 'Work start time')
      push('work_end_at', 'Work end time')
      continue
    }
    if (field.required && COMPLETION_KEY_LABELS[key]) {
      push(key, field.label || COMPLETION_KEY_LABELS[key])
    }
  }

  if (layoutHasSystemKey(layout, 'work_stamps')) {
    push('work_start_at', 'Work start time')
    push('work_end_at', 'Work end time')
  }

  return fields.length ? fields : COMPLETION_FALLBACK_FIELDS
}

export function assignmentValuesFromLayoutValues(values = {}) {
  const pick = (key) => {
    if (values[key] != null && values[key] !== '') return values[key]
    if (values[`system:${key}`] != null) return values[`system:${key}`]
    return undefined
  }
  const assignees = pick('assignee_ids')
  return {
    assignedEmployeeIds: Array.isArray(assignees) ? assignees.filter(Boolean) : [],
    workCenter: pick('work_center') || '',
    priority: pick('priority') || '',
    plannedStartAt: pick('planned_start_at') || null,
    plannedEndAt: pick('planned_end_at') || null,
    assignmentRemarks: pick('assignment_remarks') || '',
  }
}
