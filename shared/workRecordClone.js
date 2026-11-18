/**
 * Clone comparables for route-based creates (Duplicate → prefilled create).
 *
 * Each `to*CloneComparable` accepts either a DB/API row (snake_case), a create
 * request body (snake_case), or a client draft (camelCase / form values) and maps
 * it to the same flat shape so the source record and the next payload can be
 * compared with `assertCloneChanged` / `enforceCloneOfId` from ./recordClone.js.
 */

function pick(obj, ...keys) {
  for (const key of keys) {
    if (obj?.[key] !== undefined) return obj[key]
  }
  return undefined
}

function text(value) {
  return value == null ? '' : String(value).trim()
}

function lowerText(value) {
  return text(value).toLowerCase()
}

function numberish(value) {
  if (value == null || value === '') return ''
  const n = Number(value)
  return Number.isFinite(n) ? n : text(value)
}

/** Timestamps compared at minute precision; unparseable values fall back to text. */
function timestampText(value) {
  const raw = text(value)
  if (!raw) return ''
  const parsed = Date.parse(raw)
  if (Number.isNaN(parsed)) return raw
  return new Date(parsed).toISOString().slice(0, 16)
}

function timeOfDay(value) {
  return text(value).slice(0, 5)
}

function idList(value) {
  if (!Array.isArray(value)) return []
  return [...new Set(
    value
      .map((item) => (item && typeof item === 'object' ? item.id : item))
      .map((item) => text(item))
      .filter(Boolean),
  )].sort()
}

function textList(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => text(item)).filter(Boolean)
}

/** Only require unique keys that actually have a value on the source record. */
export function cloneUniqueKeysFor(source, candidateKeys = []) {
  return candidateKeys.filter((key) => text(source?.[key]) !== '')
}

// ---------------------------------------------------------------------------
// Manual work orders
// ---------------------------------------------------------------------------

export const MANUAL_WO_CLONE_UNIQUE_KEYS = ['short_description']

export const MANUAL_WO_CLONE_COMPARE_KEYS = [
  'short_description',
  'problem_description',
  'priority',
  'equipment_id',
  'work_center',
  'special_instructions',
  'assigned_department_id',
  'assigned_location_id',
  'assigned_employee_ids',
  'is_breakdown',
  'planned_start_at',
  'planned_end_at',
  'vendor_id',
  'vendor_expense',
  'labour_count',
  'work_start_at',
  'work_end_at',
  'job_description',
  'root_cause',
  'action_taken',
  'special_tools_used',
  'safety_precautions',
  'lessons_learned',
  'execution_remarks',
  'material_consumed',
  'permit_required',
  'permit_types',
  'permit_number',
  'permit_issue_at',
  'permit_expiry_at',
  'checklist_template_id',
]

export function toManualWorkOrderCloneComparable(record) {
  const problem = text(pick(record, 'problem_description', 'problemDescription'))
  const short = text(pick(record, 'short_description', 'shortDescription')) || problem
  const employeeIds = pick(record, 'assigned_employee_ids', 'assignedEmployeeIds', 'assignees')
  const priority = lowerText(pick(record, 'priority'))
  return {
    short_description: short,
    problem_description: problem,
    priority: ['high', 'medium', 'low'].includes(priority) ? priority : 'medium',
    equipment_id: text(pick(record, 'equipment_id', 'equipmentId')),
    work_center: text(pick(record, 'work_center', 'workCenter')),
    special_instructions: text(pick(record, 'special_instructions', 'specialInstructions')),
    assigned_department_id: text(pick(record, 'assigned_department_id', 'assignedDepartmentId')),
    assigned_location_id: text(pick(record, 'assigned_location_id', 'assignedLocationId')),
    assigned_employee_ids: idList(employeeIds),
    is_breakdown: Boolean(pick(record, 'is_breakdown', 'isBreakdown')),
    planned_start_at: timestampText(pick(record, 'planned_start_at', 'plannedStartAt')),
    planned_end_at: timestampText(pick(record, 'planned_end_at', 'plannedEndAt')),
    vendor_id: text(pick(record, 'vendor_id', 'vendorId')),
    vendor_expense: numberish(pick(record, 'vendor_expense', 'vendorExpense')),
    labour_count: numberish(pick(record, 'labour_count', 'labourCount')),
    work_start_at: timestampText(pick(record, 'work_start_at', 'workStartAt')),
    work_end_at: timestampText(pick(record, 'work_end_at', 'workEndAt')),
    job_description: text(pick(record, 'job_description', 'jobDescription')),
    root_cause: text(pick(record, 'root_cause', 'rootCause')),
    action_taken: text(pick(record, 'action_taken', 'actionTaken')),
    special_tools_used: text(pick(record, 'special_tools_used', 'specialToolsUsed')),
    safety_precautions: text(pick(record, 'safety_precautions', 'safetyPrecautions')),
    lessons_learned: text(pick(record, 'lessons_learned', 'lessonsLearned')),
    execution_remarks: text(pick(record, 'execution_remarks', 'executionRemarks')),
    material_consumed: text(pick(record, 'material_consumed', 'materialConsumed')),
    permit_required: Boolean(pick(record, 'permit_required', 'permitRequired')),
    permit_types: textList(pick(record, 'permit_types', 'permitTypes')),
    permit_number: text(pick(record, 'permit_number', 'permitNumber')),
    permit_issue_at: timestampText(pick(record, 'permit_issue_at', 'permitIssueAt')),
    permit_expiry_at: timestampText(pick(record, 'permit_expiry_at', 'permitExpiryAt')),
    checklist_template_id: text(pick(record, 'checklist_template_id', 'checklistTemplateId')),
  }
}

// ---------------------------------------------------------------------------
// Work requests
// ---------------------------------------------------------------------------

export const WORK_REQUEST_CLONE_UNIQUE_KEYS = ['short_description']

/**
 * order_from_department_id is intentionally excluded: for non-admins it is derived
 * from the requester's department, so it is not a user-driven change.
 */
export const WORK_REQUEST_CLONE_COMPARE_KEYS = [
  'short_description',
  'problem_description',
  'request_type',
  'order_to_department_id',
  'equipment_id',
  'job_nature',
  'priority',
  'remarks',
  'checklist_template_id',
]

export function toWorkRequestCloneComparable(record) {
  const priority = lowerText(pick(record, 'priority'))
  return {
    short_description: text(pick(record, 'short_description', 'shortDescription')),
    problem_description: text(pick(record, 'problem_description', 'problemDescription')),
    request_type: text(pick(record, 'request_type', 'requestType')),
    order_to_department_id: text(pick(record, 'order_to_department_id', 'orderToDepartmentId')),
    equipment_id: text(pick(record, 'equipment_id', 'equipmentId')),
    job_nature: text(pick(record, 'job_nature', 'jobNature')),
    priority: ['high', 'medium', 'low'].includes(priority) ? priority : (priority || 'medium'),
    remarks: text(pick(record, 'remarks')),
    checklist_template_id: text(pick(record, 'checklist_template_id', 'checklistTemplateId')),
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const TASK_CLONE_UNIQUE_KEYS = ['title']

export const TASK_CLONE_COMPARE_KEYS = [
  'title',
  'short_description',
  'detailed_description',
  'visibility_type',
  'task_type',
  'category_id',
  'priority_id',
  'vendor_id',
  'start_date',
  'start_time',
  'due_date',
  'due_time',
  'department_id',
  'location_id',
  'follow_up_remarks',
  'next_action',
  'assignee_employee_ids',
  'tag_ids',
]

export function toTaskCloneComparable(record) {
  return {
    title: text(pick(record, 'title')),
    short_description: text(pick(record, 'short_description')),
    detailed_description: text(pick(record, 'detailed_description')),
    visibility_type: text(pick(record, 'visibility_type')) || 'self',
    task_type: text(pick(record, 'task_type')) || 'one_time',
    category_id: text(pick(record, 'category_id')),
    priority_id: text(pick(record, 'priority_id')),
    vendor_id: text(pick(record, 'vendor_id')),
    start_date: text(pick(record, 'start_date')),
    start_time: timeOfDay(pick(record, 'start_time')),
    due_date: text(pick(record, 'due_date')),
    due_time: timeOfDay(pick(record, 'due_time')),
    department_id: text(pick(record, 'department_id')),
    location_id: text(pick(record, 'location_id')),
    follow_up_remarks: text(pick(record, 'follow_up_remarks')),
    next_action: text(pick(record, 'next_action')),
    assignee_employee_ids: idList(pick(record, 'assignee_employee_ids', 'assignees')),
    tag_ids: idList(pick(record, 'tag_ids', 'tags_list')),
  }
}

// ---------------------------------------------------------------------------
// Warranties
// ---------------------------------------------------------------------------

/**
 * `purchase_ref` = PO number + invoice number across line items. It is the clone
 * business key, but only enforced when the source actually has a PO / invoice.
 */
export const WARRANTY_CLONE_UNIQUE_KEYS = ['purchase_ref']

export const WARRANTY_CLONE_COMPARE_KEYS = [
  'purchase_ref',
  'vendor_ref',
  'contact_name',
  'contact_phone',
  'contact_email',
  'items',
]

function warrantyItemComparable(item) {
  return {
    product_name: text(pick(item, 'product_name')),
    model_part_no: text(pick(item, 'model_part_no')),
    value: numberish(pick(item, 'value')),
    remarks: text(pick(item, 'remarks')),
    purchase_date: text(pick(item, 'purchase_date')),
    make: text(pick(item, 'make')),
    po_number: text(pick(item, 'po_number')),
    po_date: text(pick(item, 'po_date')),
    invoice_number: text(pick(item, 'invoice_number')),
    invoice_date: text(pick(item, 'invoice_date')),
    warranty_start: text(pick(item, 'warranty_start')),
    warranty_end: text(pick(item, 'warranty_end')),
    expiry_notification_days: numberish(pick(item, 'expiry_notification_days')),
  }
}

export function toWarrantyCloneComparable(record) {
  const rawItems = Array.isArray(record?.items) ? record.items : []
  const items = rawItems.map(warrantyItemComparable)
  const refs = items
    .map((item) => [item.po_number, item.invoice_number].filter(Boolean).join('/'))
    .filter(Boolean)
  const headerRef = [text(record?.po_number), text(record?.invoice_number)].filter(Boolean).join('/')
  const purchaseRef = (refs.length ? refs : (headerRef ? [headerRef] : [])).join('|').toLowerCase()
  return {
    purchase_ref: purchaseRef,
    vendor_ref: text(pick(record, 'vendor_id')) || lowerText(pick(record, 'vendor')),
    contact_name: text(pick(record, 'contact_name')),
    contact_phone: text(pick(record, 'contact_phone')),
    contact_email: text(pick(record, 'contact_email')),
    items,
  }
}

// ---------------------------------------------------------------------------
// Checklists
// ---------------------------------------------------------------------------

export const CHECKLIST_CLONE_UNIQUE_KEYS = ['name']

/**
 * Server only sees the template row on create (sections/fields are written by
 * follow-up calls), so the server enforces the unique name; the client also
 * requires another detail (description / forms / active / sections) to change.
 */
export const CHECKLIST_CLONE_SERVER_COMPARE_KEYS = ['name']

export const CHECKLIST_CLONE_COMPARE_KEYS = [
  'name',
  'description',
  'form_ids',
  'is_active',
  'sections',
]

export function toChecklistCloneComparable(record) {
  const formIds = pick(record, 'form_ids', 'formIds')
  const sections = Array.isArray(record?.sections) ? record.sections : []
  return {
    name: text(pick(record, 'name')),
    description: text(pick(record, 'description')),
    form_ids: textList(formIds).sort(),
    is_active: pick(record, 'is_active', 'isActive') !== false,
    sections: sections.map((section) => ({
      name: text(section?.name),
      fields: (Array.isArray(section?.fields) ? section.fields : []).map((field) => ({
        name: text(field?.name),
        field_type: text(field?.field_type),
        options: textList(field?.options),
        is_required: Boolean(field?.is_required),
      })),
    })),
  }
}
