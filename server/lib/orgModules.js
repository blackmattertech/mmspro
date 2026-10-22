/**
 * Super Admin org entitlements (sidebar product modules).
 * Keep in sync with client/src/lib/orgModules.js.
 */

export const PRODUCT_MODULE_GROUPS = [
  {
    id: 'main',
    label: 'Main',
    modules: [
      { id: 'dashboard', label: 'Dashboard', permissionKeys: ['dashboard'] },
      { id: 'calendar', label: 'Calendar', permissionKeys: ['calendar'] },
      { id: 'work_request', label: 'Work Request', permissionKeys: [
        'work_request',
        'work_request_create',
        'work_request_my',
        'work_request_incoming',
        'work_request_approve',
        'work_request_outgoing',
        'work_request_all',
      ] },
      { id: 'work_orders', label: 'Work Orders', permissionKeys: [
        'work_orders',
        'work_orders_received',
        'work_orders_approve',
        'work_orders_assigned',
        'work_orders_manual',
      ] },
      { id: 'work_orders_scheduled', label: 'PM Schedule', permissionKeys: ['work_orders_scheduled'] },
      { id: 'logbook', label: 'Logbook', permissionKeys: ['logbook'] },
      { id: 'tasks_followups', label: 'Tasks & Follow-ups', permissionKeys: ['tasks_followups'] },
      { id: 'warranty_manager', label: 'Warranty Manager', permissionKeys: ['warranty_manager'] },
      { id: 'reports', label: 'Reports', permissionKeys: [
        'reports',
        'reports_daily_logs',
        'reports_plant_wise',
        'reports_open_logs',
        'reports_completed_logs',
        'reports_overdue',
      ] },
    ],
  },
  {
    id: 'masters',
    label: 'Masters',
    modules: [
      { id: 'company', label: 'Company', permissionKeys: [
        'company',
        'locations',
        'departments',
        'work_centers',
        'employees',
      ] },
      { id: 'assets', label: 'Fields', permissionKeys: ['assets'] },
      { id: 'equipment', label: 'Equipment', permissionKeys: ['equipment', 'areas'] },
      { id: 'vendors', label: 'Vendors', permissionKeys: ['vendors'], entitlementOnly: true },
      { id: 'others', label: 'Others', permissionKeys: ['others'], entitlementOnly: true },
    ],
  },
  {
    id: 'configuration',
    label: 'Configuration',
    modules: [
      { id: 'roles_access', label: 'Roles & Access', permissionKeys: ['roles_access'] },
      { id: 'settings', label: 'Settings / Import / Export', permissionKeys: ['settings'] },
    ],
  },
]

export const PRODUCT_MODULES = PRODUCT_MODULE_GROUPS.flatMap((group) => (
  group.modules.map((mod) => ({ ...mod, groupId: group.id, groupLabel: group.label }))
))

export const PRODUCT_MODULE_IDS = PRODUCT_MODULES.map((mod) => mod.id)

const PRODUCT_ID_SET = new Set(PRODUCT_MODULE_IDS)

const PERMISSION_KEY_TO_PRODUCT = new Map()
const ENTITLEMENT_ONLY_KEYS = new Set()
for (const mod of PRODUCT_MODULES) {
  for (const key of mod.permissionKeys) {
    PERMISSION_KEY_TO_PRODUCT.set(key, mod.id)
    if (mod.entitlementOnly) ENTITLEMENT_ONLY_KEYS.add(key)
  }
}

export function isProductModuleId(value) {
  return PRODUCT_ID_SET.has(value)
}

export function normalizeDisabledModules(raw) {
  const list = Array.isArray(raw) ? raw : []
  const seen = new Set()
  const next = []
  for (const value of list) {
    const id = String(value || '').trim()
    if (!PRODUCT_ID_SET.has(id) || seen.has(id)) continue
    seen.add(id)
    next.push(id)
  }
  return next
}

export function isProductModuleEnabled(disabledModules, productId) {
  if (!productId) return true
  const disabled = new Set(normalizeDisabledModules(disabledModules))
  return !disabled.has(productId)
}

export function productIdForPermissionKey(permissionKey) {
  return PERMISSION_KEY_TO_PRODUCT.get(permissionKey) || null
}

export function isPermissionKeyEnabled(disabledModules, permissionKey) {
  const productId = productIdForPermissionKey(permissionKey)
  if (!productId) return true
  return isProductModuleEnabled(disabledModules, productId)
}

export function isEntitlementOnlyKey(permissionKey) {
  return ENTITLEMENT_ONLY_KEYS.has(permissionKey)
}

export function filterAccessGroupsByEntitlements(groups, disabledModules) {
  return (groups || [])
    .map((group) => ({
      ...group,
      modules: (group.modules || []).filter((mod) => (
        isPermissionKeyEnabled(disabledModules, mod.key)
      )),
    }))
    .filter((group) => group.modules.length > 0)
}

export function isMissingDisabledModulesColumn(error) {
  const msg = String(error?.message || '')
  return msg.includes('disabled_modules') && /does not exist/i.test(msg)
}

export function parseDisabledModulesInput(raw) {
  if (!Array.isArray(raw)) {
    const err = new Error('disabled_modules must be an array of module ids')
    err.status = 400
    throw err
  }
  const unknown = raw
    .map((value) => String(value || '').trim())
    .filter((id) => id && !PRODUCT_ID_SET.has(id))
  if (unknown.length) {
    const err = new Error(`Unknown module(s): ${unknown.join(', ')}`)
    err.status = 400
    throw err
  }
  return normalizeDisabledModules(raw)
}
