import {
  COMPANY_PAGE_MODULE_KEYS,
  MODULE_LEGACY_EXPAND,
  WORK_ORDER_MODULE_KEYS,
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
    id: 'work-orders',
    label: 'Work Orders',
    icon: 'document',
    moduleKey: 'work_orders',
    children: [
      { label: 'Received', segment: 'work-orders/received', moduleKey: 'work_orders_received' },
      { label: 'Assigned', segment: 'work-orders/assigned', moduleKey: 'work_orders_assigned' },
      { label: 'Scheduled', segment: 'work-orders/scheduled', moduleKey: 'work_orders_scheduled' },
      { label: 'Manual', segment: 'work-orders/manual', moduleKey: 'work_orders_manual' },
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
        altModuleKeys: ['locations', 'departments', 'designations', 'employees'],
      },
      { label: 'Assets', segment: 'masters/assets', moduleKey: 'assets' },
    ],
  },
  {
    id: 'configuration',
    label: 'Configuration',
    icon: 'settings',
    children: [
      { label: 'Roles & Access', segment: 'configuration/roles', moduleKey: 'roles_access' },
      { label: 'Settings', segment: 'configuration/settings', moduleKey: 'settings' },
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
  if (rest.startsWith('configuration/roles')) return 'roles_access'
  if (rest.startsWith('configuration/settings')) return 'settings'
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

export { MODULE_LEGACY_EXPAND, COMPANY_PAGE_MODULE_KEYS, WORK_ORDER_MODULE_KEYS }
