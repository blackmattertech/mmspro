/**
 * Maps Forms Master modules / forms to org status entity types.
 * Keep descriptions in sync with the former Others → Status hub.
 */
export const STATUS_ENTITY_LABELS = {
  work_request: 'Work Request',
  work_order: 'Work Order',
  task: 'Tasks & Follow-ups',
  pm_plan: 'Planned Maintenance',
}

export const MODULE_STATUS_MASTERS = {
  work_request: {
    entityType: 'work_request',
    title: 'Status',
    description: 'Statuses used on work requests and their filters.',
  },
  work_orders: {
    entityType: 'work_order',
    title: 'Status',
    description: 'Statuses for received, assigned, scheduled, and manual work orders.',
  },
  work_orders_scheduled: {
    entityType: 'pm_plan',
    title: 'Status',
    description: 'Active, inactive, overdue, and custom statuses for PM plans.',
  },
  tasks_followups: {
    entityType: 'task',
    title: 'Status',
    description: 'Statuses available when creating or updating tasks.',
  },
}

export const FORM_STATUS_ENTITY = {
  'work_request.create': 'work_request',
  'work_orders.from_work_request': 'work_order',
  'work_orders.from_pm': 'work_order',
  'work_orders.manual': 'work_order',
  'work_orders.user_self': 'work_order',
  'pm.plan': 'pm_plan',
}

export function statusMasterForModule(moduleId) {
  return MODULE_STATUS_MASTERS[moduleId] || null
}

export function statusEntityForForm(formId) {
  return FORM_STATUS_ENTITY[formId] || null
}

export function statusMasterForForm(formId) {
  const entityType = statusEntityForForm(formId)
  if (!entityType) return null
  const match = Object.values(MODULE_STATUS_MASTERS).find((row) => row.entityType === entityType)
  return match || {
    entityType,
    title: 'Status',
    description: `Statuses used on ${STATUS_ENTITY_LABELS[entityType] || entityType}.`,
  }
}
