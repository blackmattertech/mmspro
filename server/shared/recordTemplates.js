/** Org-shared record templates — module keys, caps, and permission mapping. */

export const RECORD_TEMPLATE_MODULES = Object.freeze([
  {
    key: 'work_request',
    label: 'Work Request',
    permissionKeys: ['work_request_create', 'work_request'],
    createPath: 'work-request/create',
  },
  {
    key: 'work_orders_manual',
    label: 'Manual Work Order',
    permissionKeys: ['work_orders_manual', 'work_orders'],
    createPath: 'work-orders/manual/create',
  },
  {
    key: 'work_orders_scheduled',
    label: 'PM Schedule',
    permissionKeys: ['work_orders_scheduled', 'work_orders'],
    createPath: 'work-orders/scheduled',
  },
  {
    key: 'tasks_followups',
    label: 'Tasks & Follow-ups',
    permissionKeys: ['tasks_followups'],
    createPath: 'tasks-and-followups/create',
  },
])

export const RECORD_TEMPLATE_MODULE_KEYS = Object.freeze(
  RECORD_TEMPLATE_MODULES.map((row) => row.key),
)

export const RECORD_TEMPLATE_MAX_PER_MODULE = 50
export const RECORD_TEMPLATE_MAX_ATTACHMENTS = 40
export const RECORD_TEMPLATE_MAX_FILE_BYTES = 25 * 1024 * 1024
export const RECORD_TEMPLATE_BUCKET = 'record-templates'
export const RECORD_TEMPLATE_NAME_MIN = 3
export const RECORD_TEMPLATE_NAME_MAX = 120

export function recordTemplateModule(key) {
  return RECORD_TEMPLATE_MODULES.find((row) => row.key === String(key || '')) || null
}

export function isRecordTemplateModuleKey(key) {
  return RECORD_TEMPLATE_MODULE_KEYS.includes(String(key || ''))
}

export function normalizeTemplateName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

export function validateTemplateName(value) {
  const name = normalizeTemplateName(value)
  if (name.length < RECORD_TEMPLATE_NAME_MIN || name.length > RECORD_TEMPLATE_NAME_MAX) {
    const error = new Error(
      `Template name must be between ${RECORD_TEMPLATE_NAME_MIN} and ${RECORD_TEMPLATE_NAME_MAX} characters`,
    )
    error.status = 400
    throw error
  }
  return name
}
