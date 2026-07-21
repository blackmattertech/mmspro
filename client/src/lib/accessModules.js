/**
 * Access modules for Roles & Access.
 * Grouped to match app navigation; each leaf key is stored in org_access_role_permissions.
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
      { key: 'work_request_outgoing', label: 'Outgoing Requests', actions: ['create', 'read', 'update', 'delete'] },
      { key: 'work_request_all', label: 'All Requests', actions: ['create', 'read', 'update', 'delete'] },
    ],
  },
  {
    id: 'work_orders',
    label: 'Work Orders',
    modules: [
      { key: 'work_orders_received', label: 'Received', actions: ['create', 'read', 'update', 'delete'] },
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

/** Flat list of leaf modules (permission storage keys). */
export const ACCESS_MODULES = ACCESS_MODULE_GROUPS.flatMap((group) =>
  group.modules.map((mod) => ({ ...mod, groupId: group.id, groupLabel: group.label })),
)

/** Legacy parent keys → child keys (for migration + API compat). */
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
  company: ['locations', 'departments'],
}

export const PERMISSION_ACTIONS = ['create', 'read', 'update', 'delete']

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

/**
 * Normalize permission rows for storage / API.
 * Expands legacy `work_orders` / `reports` into child keys when children are absent.
 */
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

  // Expand legacy parents into children when children were not explicitly set.
  for (const [parent, children] of Object.entries(MODULE_LEGACY_EXPAND)) {
    const legacy = byKey.get(parent)
    if (!legacy) continue
    for (const childKey of children) {
      if (byKey.has(childKey)) continue
      const mod = ACCESS_MODULES.find((m) => m.key === childKey)
      if (!mod) continue
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

export function permissionsByModule(permissions) {
  const normalized = normalizePermissionsInput(permissions)
  const map = new Map(normalized.map((row) => [row.module_key, row]))
  return ACCESS_MODULES.map((mod) => map.get(mod.key) || emptyRow(mod.key))
}

export function togglePermissionRow(row, action, checked) {
  const key = `can_${action}`
  return { ...row, [key]: checked }
}

export function toggleModuleRow(module, row, checked) {
  const next = { ...row }
  for (const action of module.actions) {
    next[`can_${action}`] = checked
  }
  return next
}

export function isModuleFullyChecked(module, row) {
  return module.actions.every((action) => row[`can_${action}`])
}

export function isGroupFullyChecked(group, permissions) {
  return group.modules.every((mod) => {
    const row = permissions.find((p) => p.module_key === mod.key) || emptyRow(mod.key)
    return isModuleFullyChecked(mod, row)
  })
}

export function isGroupPartiallyChecked(group, permissions) {
  if (isGroupFullyChecked(group, permissions)) return false
  return group.modules.some((mod) => {
    const row = permissions.find((p) => p.module_key === mod.key) || emptyRow(mod.key)
    return mod.actions.some((action) => row[`can_${action}`])
  })
}

export function toggleGroupModules(group, permissions, checked) {
  const keys = new Set(group.modules.map((m) => m.key))
  return permissions.map((row) => {
    if (!keys.has(row.module_key)) return row
    const mod = group.modules.find((m) => m.key === row.module_key)
    return toggleModuleRow(mod, row, checked)
  })
}

export function isActionColumnChecked(permissions, action) {
  const key = `can_${action}`
  const applicable = ACCESS_MODULES.filter((mod) => mod.actions.includes(action))
  if (!applicable.length) return false
  return applicable.every((mod) => {
    const row = permissions.find((p) => p.module_key === mod.key)
    return row?.[key]
  })
}

export function toggleActionColumn(permissions, action, checked) {
  return permissions.map((row) => {
    const mod = ACCESS_MODULES.find((m) => m.key === row.module_key)
    if (!mod?.actions.includes(action)) return row
    return { ...row, [`can_${action}`]: checked }
  })
}

/** Keys that grant access to the Company page (any one is enough to open it). */
export const COMPANY_PAGE_MODULE_KEYS = [
  'company',
  'locations',
  'departments',
  'areas',
  'employees',
]

/** Keys that grant work-request area access. */
export const WORK_REQUEST_MODULE_KEYS = [
  'work_request',
  'work_request_create',
  'work_request_my',
  'work_request_incoming',
  'work_request_outgoing',
  'work_request_all',
]

/** Keys that grant work-orders area access. */
export const WORK_ORDER_MODULE_KEYS = [
  'work_orders',
  'work_orders_received',
  'work_orders_assigned',
  'work_orders_scheduled',
  'work_orders_manual',
]

export const REPORT_MODULE_KEYS = [
  'reports',
  'reports_daily_logs',
  'reports_plant_wise',
  'reports_open_logs',
  'reports_completed_logs',
  'reports_overdue',
]
