export const WORK_ORDER_TABS = [
  {
    id: 'received',
    label: 'Received',
    segment: 'work-orders/received',
    countKey: 'received',
    moduleKey: 'work_orders_received',
  },
  {
    id: 'assigned',
    label: 'Assigned',
    segment: 'work-orders/assigned',
    countKey: 'assigned',
    moduleKey: 'work_orders_assigned',
  },
  {
    id: 'scheduled',
    label: 'Scheduled',
    segment: 'work-orders/scheduled',
    countKey: 'scheduled',
    moduleKey: 'work_orders_scheduled',
  },
  {
    id: 'manual',
    label: 'Manual',
    segment: 'work-orders/manual',
    countKey: 'manual',
    moduleKey: 'work_orders_manual',
  },
]

export function isWorkOrderTabActive(tabId, pathname) {
  return pathname.includes(`/work-orders/${tabId}`)
}

export function getWorkOrderActiveTab(pathname) {
  const match = WORK_ORDER_TABS.find((tab) => isWorkOrderTabActive(tab.id, pathname))
  return match?.id ?? null
}
