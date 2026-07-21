import {
  COMPANY_PAGE_MODULE_KEYS,
  MODULE_LEGACY_EXPAND,
  WORK_ORDER_MODULE_KEYS,
  WORK_REQUEST_MODULE_KEYS,
  REPORT_MODULE_KEYS,
} from '../lib/accessModules'

const APP_SEGMENTS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    segment: 'dashboard',
    icon: 'home',
    moduleKey: 'dashboard',
  },
  {
    id: 'work-request',
    label: 'Work Request',
    icon: 'clipboard',
    moduleKey: 'work_request',
    children: [
      { label: 'Create Work Request', segment: 'work-request/create', moduleKey: 'work_request_create', icon: 'addSquare' },
      { label: 'My Requests', segment: 'work-request/my', moduleKey: 'work_request_my', icon: 'profileIncoming' },
      { label: 'Incoming Requests', segment: 'work-request/incoming', moduleKey: 'work_request_incoming', icon: 'arrowDownLeft' },
      { label: 'Outgoing Requests', segment: 'work-request/outgoing', moduleKey: 'work_request_outgoing', icon: 'arrowUpRight' },
      { label: 'All Requests', segment: 'work-request/all', moduleKey: 'work_request_all', icon: 'arrowSwap' },
    ],
  },
  {
    id: 'work-orders',
    label: 'Work Orders',
    icon: 'document',
    moduleKey: 'work_orders',
    children: [
      { label: 'Received', segment: 'work-orders/received', moduleKey: 'work_orders_received', icon: 'addItem' },
      { label: 'Assigned', segment: 'work-orders/assigned', moduleKey: 'work_orders_assigned', icon: 'userAdd' },
      { label: 'Scheduled', segment: 'work-orders/scheduled', moduleKey: 'work_orders_scheduled', icon: 'alarmCheck' },
      { label: 'Manual', segment: 'work-orders/manual', moduleKey: 'work_orders_manual', icon: 'bill' },
    ],
  },
  {
    id: 'calendar',
    label: 'Calendar',
    segment: 'calendar',
    icon: 'calendar',
    moduleKey: 'calendar',
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: 'chart',
    moduleKey: 'reports',
    children: [
      { label: 'Daily Logs', segment: 'reports/daily-logs', moduleKey: 'reports_daily_logs' },
      { label: 'Plant Wise Report', segment: 'reports/plant-wise', moduleKey: 'reports_plant_wise' },
      { label: 'Open Logs', segment: 'reports/open-logs', moduleKey: 'reports_open_logs' },
      { label: 'Completed Logs', segment: 'reports/completed-logs', moduleKey: 'reports_completed_logs' },
      { label: 'Overdue Workorders', segment: 'reports/overdue', moduleKey: 'reports_overdue' },
    ],
  },
  {
    id: 'masters',
    label: 'Masters',
    icon: 'list',
    children: [
      {
        label: 'Company',
        segment: 'masters/company',
        moduleKey: 'company',
        icon: 'buildings',
        altModuleKeys: ['locations', 'departments', 'employees'],
      },
      { label: 'Assets', segment: 'masters/assets', moduleKey: 'assets', icon: 'asset' },
      { label: 'Equipment', segment: 'masters/equipment', moduleKey: 'equipment', icon: 'washer', altModuleKeys: ['areas'] },
    ],
  },
  {
    id: 'configuration',
    label: 'Configuration',
    icon: 'settings',
    children: [
      { label: 'Roles & Access', segment: 'configuration/roles', moduleKey: 'roles_access', icon: 'key' },
      { label: 'Settings', segment: 'configuration/settings', moduleKey: 'settings', icon: 'settings' },
      { label: 'Import', segment: 'configuration/import', moduleKey: 'settings', icon: 'upload' },
      { label: 'Export', segment: 'configuration/export', moduleKey: 'settings', icon: 'download' },
    ],
  },
]

export function orgPath(orgSlug, segment = 'dashboard') {
  return `/${orgSlug}/${segment}`
}

/** Map route path segments (after org slug) to access module keys. */
export function moduleKeyForPath(pathname, orgSlug) {
  if (!pathname || !orgSlug) return null
  const prefix = `/${orgSlug}/`
  if (!pathname.startsWith(prefix) && pathname !== `/${orgSlug}`) return null
  const rest = pathname === `/${orgSlug}` ? 'dashboard' : pathname.slice(prefix.length)

  if (rest.startsWith('dashboard')) return 'dashboard'
  if (rest.startsWith('work-request/create')) return 'work_request_create'
  if (rest.startsWith('work-request/my')) return 'work_request_my'
  if (rest.startsWith('work-request/incoming')) return 'work_request_incoming'
  if (rest.startsWith('work-request/outgoing')) return 'work_request_outgoing'
  if (rest.startsWith('work-request/all')) return 'work_request_all'
  if (rest.startsWith('work-request')) return 'work_request'
  if (rest.startsWith('work-orders/received')) return 'work_orders_received'
  if (rest.startsWith('work-orders/assigned')) return 'work_orders_assigned'
  if (rest.startsWith('work-orders/scheduled')) return 'work_orders_scheduled'
  if (rest.startsWith('work-orders/manual')) return 'work_orders_manual'
  if (rest.startsWith('work-orders')) return 'work_orders'
  if (rest.startsWith('calendar')) return 'calendar'
  if (rest.startsWith('reports/daily-logs')) return 'reports_daily_logs'
  if (rest.startsWith('reports/plant-wise')) return 'reports_plant_wise'
  if (rest.startsWith('reports/open-logs')) return 'reports_open_logs'
  if (rest.startsWith('reports/completed-logs')) return 'reports_completed_logs'
  if (rest.startsWith('reports/overdue')) return 'reports_overdue'
  if (rest.startsWith('reports')) return 'reports'
  if (rest.startsWith('masters/company')) return 'company'
  if (rest.startsWith('masters/assets')) return 'assets'
  if (rest.startsWith('masters/equipment')) return 'equipment'
  if (rest.startsWith('configuration/roles')) return 'roles_access'
  if (rest.startsWith('configuration/settings')) return 'settings'
  if (rest.startsWith('configuration/import')) return 'settings'
  if (rest.startsWith('configuration/export')) return 'settings'
  if (rest.startsWith('configuration')) return 'settings'
  if (rest.startsWith('masters')) return 'company'
  return null
}

export function moduleKeysForPath(pathname, orgSlug) {
  const key = moduleKeyForPath(pathname, orgSlug)
  if (!key) return []
  if (key === 'company' || COMPANY_PAGE_MODULE_KEYS.includes(key)) {
    return COMPANY_PAGE_MODULE_KEYS
  }
  if (WORK_REQUEST_MODULE_KEYS.includes(key)) {
    return [key, 'work_request']
  }
  if (WORK_ORDER_MODULE_KEYS.includes(key)) {
    return [key, 'work_orders']
  }
  if (REPORT_MODULE_KEYS.includes(key)) {
    return [key, 'reports']
  }
  return [key]
}

export function getNavItems(orgSlug, { canRead } = {}) {
  const allow = typeof canRead === 'function' ? canRead : () => true
  const allowItem = (item) => {
    if (allow(item.moduleKey)) return true
    return (item.altModuleKeys || []).some((key) => allow(key))
  }

  return APP_SEGMENTS
    .map((item) => {
      if (item.children) {
        const children = item.children
          .filter((child) => allowItem(child))
          .map((child) => ({
            ...child,
            path: orgPath(orgSlug, child.segment),
          }))
        if (!children.length) return null
        return { ...item, children }
      }
      if (!allowItem(item)) return null
      return {
        ...item,
        path: orgPath(orgSlug, item.segment),
      }
    })
    .filter(Boolean)
}

/** Flatten nav into leaf pages that can be pinned as shortcuts. */
export function getShortcutOptions(orgSlug, { canRead } = {}) {
  const options = []
  for (const item of getNavItems(orgSlug, { canRead })) {
    if (item.children) {
      for (const child of item.children) {
        options.push({
          id: child.segment,
          label: child.label,
          path: child.path,
          icon: child.icon || item.icon || 'document',
          group: item.label,
        })
      }
    } else {
      options.push({
        id: item.segment || item.id,
        label: item.label,
        path: item.path,
        icon: item.icon || 'document',
        group: null,
      })
    }
  }
  return options
}

export {
  MODULE_LEGACY_EXPAND,
  COMPANY_PAGE_MODULE_KEYS,
  WORK_ORDER_MODULE_KEYS,
  WORK_REQUEST_MODULE_KEYS,
}
