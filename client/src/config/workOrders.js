export const WORK_ORDER_TABS = [
  {
    id: 'all',
    label: 'All Workorders',
    segment: 'work-orders/all',
    countKey: 'all',
    moduleKey: 'work_orders_received',
    icon: 'addItem',
  },
  {
    id: 'unassigned',
    label: 'Unassigned',
    segment: 'work-orders/unassigned',
    countKey: 'unassigned',
    moduleKey: 'work_orders_received',
    icon: 'addItem',
  },
  {
    id: 'assigned',
    label: 'Assigned to Me',
    segment: 'work-orders/assigned',
    countKey: 'assigned',
    moduleKey: 'work_orders_assigned',
    icon: 'userAdd',
  },
  {
    id: 'manual',
    label: 'Manual Workorders',
    segment: 'work-orders/manual',
    countKey: 'manual',
    moduleKey: 'work_orders_manual',
    icon: 'bill',
  },
]

export function isWorkOrderTabActive(tabId, pathname) {
  if (pathname.includes('/work-orders/scheduled')) return false
  if (tabId === 'manual') return /\/work-orders\/manual(?:\/|$)/.test(pathname)
  if (tabId === 'all') {
    return pathname.includes('/work-orders/all') || pathname.includes('/work-orders/received')
  }
  return pathname.includes(`/work-orders/${tabId}`)
}

export function getWorkOrderActiveTab(pathname) {
  const match = WORK_ORDER_TABS.find((tab) => isWorkOrderTabActive(tab.id, pathname))
  return match?.id ?? null
}

export function visibleWorkOrderTabs(canRead) {
  const allow = typeof canRead === 'function' ? canRead : () => true
  return WORK_ORDER_TABS.filter((tab) => allow(tab.moduleKey))
}

export function defaultWorkOrderTab(canRead) {
  const tabs = visibleWorkOrderTabs(canRead)
  return tabs.find((tab) => tab.id === 'all') || tabs[0] || null
}

export function isWorkOrdersNavPath(pathname) {
  const marker = '/work-orders'
  const index = pathname.indexOf(marker)
  if (index === -1) return false
  const rest = pathname.slice(index + marker.length)
  return rest === '' || rest === '/' || (rest.startsWith('/') && !rest.startsWith('/scheduled'))
}
