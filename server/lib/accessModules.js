/**
 * Access modules for Roles & Access.
 * Keep in sync with client/src/lib/accessModules.js
 */

export const ACCESS_MODULE_GROUPS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    modules: [
      { key: 'dashboard', label: 'Overview', actions: ['read'] },
    ],
  },
  {
    id: 'work_request',
    label: 'Work Request',
    modules: [
      { key: 'work_request_create', label: 'Create Work Request', actions: ['create', 'read', 'update', 'delete'] },
      { key: 'work_request_my', label: 'My Requests', actions: ['create', 'read', 'update', 'delete'] },
      { key: 'work_request_incoming', label: 'Incoming Requests', actions: ['create', 'read', 'update', 'delete'] },
      { key: 'work_request_approve', label: 'Approving Work Request', actions: ['update'] },
      { key: 'work_request_outgoing', label: 'Outgoing Requests', actions: ['create', 'read', 'update', 'delete'] },
      { key: 'work_request_all', label: 'All Requests', actions: ['create', 'read', 'update', 'delete'] },
    ],
  },
  {
    id: 'work_orders',
    label: 'Work Orders',
    modules: [
      { key: 'work_orders_received', label: 'Received', actions: ['create', 'read', 'update', 'delete'] },
      { key: 'work_orders_approve', label: 'Approving Work Order', actions: ['update'] },
      { key: 'work_orders_assigned', label: 'Assigned', actions: ['create', 'read', 'update', 'delete'] },
      { key: 'work_orders_scheduled', label: 'Scheduled', actions: ['create', 'read', 'update', 'delete'] },
      { key: 'work_orders_manual', label: 'Manual', actions: ['create', 'read', 'update', 'delete'] },
    ],
  },
  {
    id: 'calendar',
    label: 'Calendar',
    modules: [
      { key: 'calendar', label: 'Calendar', actions: ['create', 'read', 'update', 'delete'] },
    ],
  },
  {
    id: 'warranty_manager',
    label: 'Warranty Manager',
    modules: [
      { key: 'warranty_manager', label: 'Warranty Manager', actions: ['create', 'read', 'update', 'delete'] },
    ],
  },
  {
    id: 'tasks_followups',
    label: 'Tasks & Follow-ups',
    modules: [
      { key: 'tasks_followups', label: 'Tasks & Follow-ups', actions: ['create', 'read', 'update', 'delete'] },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    modules: [
      { key: 'reports_daily_logs', label: 'Daily Logs', actions: ['read'] },
      { key: 'reports_plant_wise', label: 'Plant Wise Report', actions: ['read'] },
      { key: 'reports_open_logs', label: 'Open Logs', actions: ['read'] },
      { key: 'reports_completed_logs', label: 'Completed Logs', actions: ['read'] },
      { key: 'reports_overdue', label: 'Overdue Workorders', actions: ['read'] },
    ],
  },
  {
    id: 'company',
    label: 'Company',
    modules: [
      { key: 'company', label: 'Company profile', actions: ['read', 'update'] },
      { key: 'locations', label: 'Locations', actions: ['create', 'read', 'update', 'delete'] },
      { key: 'departments', label: 'Departments', actions: ['create', 'read', 'update', 'delete'] },
      { key: 'work_centers', label: 'Work Center', actions: ['create', 'read', 'update', 'delete'] },
      { key: 'employees', label: 'Employees', actions: ['create', 'read', 'update', 'delete'] },
    ],
  },
  {
    id: 'masters',
    label: 'Masters',
    modules: [
      { key: 'assets', label: 'Assets', actions: ['create', 'read', 'update', 'delete'] },
      { key: 'areas', label: 'Areas', actions: ['create', 'read', 'update', 'delete'] },
      { key: 'equipment', label: 'Equipment', actions: ['create', 'read', 'update', 'delete'] },
    ],
  },
  {
    id: 'configuration',
    label: 'Configuration',
    modules: [
      { key: 'roles_access', label: 'Roles & Access', actions: ['create', 'read', 'update', 'delete'] },
      { key: 'settings', label: 'Settings', actions: ['read', 'update'] },
    ],
  },
]

export const ACCESS_MODULES = ACCESS_MODULE_GROUPS.flatMap((group) =>
  group.modules.map((mod) => ({ ...mod, groupId: group.id, groupLabel: group.label })),
)

export const MODULE_LEGACY_EXPAND = {
  work_request: [
    'work_request_create',
    'work_request_my',
    'work_request_incoming',
    'work_request_outgoing',
    'work_request_all',
  ],
  work_orders: [
    'work_orders_received',
    'work_orders_assigned',
    'work_orders_scheduled',
    'work_orders_manual',
  ],
  reports: [
    'reports_daily_logs',
    'reports_plant_wise',
    'reports_open_logs',
    'reports_completed_logs',
    'reports_overdue',
  ],
  // Older roles used company.update for locations/depts CRUD.
  company: ['locations', 'departments', 'work_centers'],
}

export const WORK_REQUEST_MODULE_KEYS = [
  'work_request',
  'work_request_create',
  'work_request_my',
  'work_request_incoming',
  'work_request_outgoing',
  'work_request_all',
]

export const WORK_ORDER_MODULE_KEYS = [
  'work_orders',
  'work_orders_received',
  'work_orders_assigned',
  'work_orders_scheduled',
  'work_orders_manual',
]

export const APPROVAL_MODULE_KEYS = [
  'work_request_approve',
  'work_orders_approve',
]

export function permissionsHaveApproval(permissions) {
  return (permissions || []).some((row) => (
    APPROVAL_MODULE_KEYS.includes(row.module_key) && Boolean(row.can_update)
  ))
}

export const REPORT_MODULE_KEYS = [
  'reports',
  'reports_daily_logs',
  'reports_plant_wise',
  'reports_open_logs',
  'reports_completed_logs',
  'reports_overdue',
]

export const COMPANY_PAGE_MODULE_KEYS = [
  'company',
  'locations',
  'departments',
  'work_centers',
  'areas',
  'employees',
]

const MODULE_KEYS = new Set(ACCESS_MODULES.map((m) => m.key))

export function isValidModuleKey(key) {
  return MODULE_KEYS.has(key) || Object.prototype.hasOwnProperty.call(MODULE_LEGACY_EXPAND, key)
}

export function emptyPermissions() {
  return ACCESS_MODULES.map((mod) => ({
    module_key: mod.key,
    can_create: false,
    can_read: false,
    can_update: false,
    can_delete: false,
  }))
}

function emptyRow(key) {
  return {
    module_key: key,
    can_create: false,
    can_read: false,
    can_update: false,
    can_delete: false,
  }
}

export function normalizePermissionsInput(permissions) {
  if (!Array.isArray(permissions)) return emptyPermissions()

  const byKey = new Map()
  for (const row of permissions) {
    const key = row?.module_key
    if (!key) continue

    if (MODULE_LEGACY_EXPAND[key]) {
      byKey.set(key, {
        module_key: key,
        can_create: Boolean(row.can_create),
        can_read: Boolean(row.can_read),
        can_update: Boolean(row.can_update),
        can_delete: Boolean(row.can_delete),
      })
      continue
    }

    if (!MODULE_KEYS.has(key)) continue
    const mod = ACCESS_MODULES.find((m) => m.key === key)
    byKey.set(key, {
      module_key: key,
      can_create: mod.actions.includes('create') && Boolean(row.can_create),
      can_read: mod.actions.includes('read') && Boolean(row.can_read),
      can_update: mod.actions.includes('update') && Boolean(row.can_update),
      can_delete: mod.actions.includes('delete') && Boolean(row.can_delete),
    })
  }

  for (const [parent, children] of Object.entries(MODULE_LEGACY_EXPAND)) {
    const legacy = byKey.get(parent)
    if (!legacy) continue
    for (const childKey of children) {
      if (byKey.has(childKey)) continue
      const mod = ACCESS_MODULES.find((m) => m.key === childKey)
      if (!mod) continue
      // company only had read/update — map update onto create/delete for masters.
      const write = parent === 'company' ? legacy.can_update : legacy.can_create
      const writeUpdate = parent === 'company' ? legacy.can_update : legacy.can_update
      const writeDelete = parent === 'company' ? legacy.can_update : legacy.can_delete
      byKey.set(childKey, {
        module_key: childKey,
        can_create: mod.actions.includes('create') && Boolean(write),
        can_read: mod.actions.includes('read') && Boolean(legacy.can_read),
        can_update: mod.actions.includes('update') && Boolean(writeUpdate),
        can_delete: mod.actions.includes('delete') && Boolean(writeDelete),
      })
    }
  }

  return ACCESS_MODULES.map((mod) => {
    const row = byKey.get(mod.key)
    if (!row) return emptyRow(mod.key)
    return {
      module_key: mod.key,
      can_create: mod.actions.includes('create') && Boolean(row.can_create),
      can_read: mod.actions.includes('read') && Boolean(row.can_read),
      can_update: mod.actions.includes('update') && Boolean(row.can_update),
      can_delete: mod.actions.includes('delete') && Boolean(row.can_delete),
    }
  })
}
