export const WORK_REQUEST_TABS = [
  {
    id: 'create',
    label: 'Create Work Request',
    segment: 'work-request/create',
    moduleKey: 'work_request_create',
    icon: 'addSquare',
  },
  {
    id: 'my',
    label: 'My Requests',
    segment: 'work-request/my',
    moduleKey: 'work_request_my',
    icon: 'profileIncoming',
  },
  {
    id: 'incoming',
    label: 'Incoming Requests',
    segment: 'work-request/incoming',
    moduleKey: 'work_request_incoming',
    icon: 'arrowDownLeft',
  },
  {
    id: 'outgoing',
    label: 'Outgoing Requests',
    segment: 'work-request/outgoing',
    moduleKey: 'work_request_outgoing',
    icon: 'arrowUpRight',
  },
  {
    id: 'all',
    label: 'All Requests',
    segment: 'work-request/all',
    moduleKey: 'work_request_all',
    icon: 'arrowSwap',
  },
]

export function isWorkRequestTabActive(tabId, pathname) {
  if (tabId === 'create') return pathname.includes('/work-request/create')
  return pathname.includes(`/work-request/${tabId}`)
}

export function getWorkRequestActiveTab(pathname) {
  const match = WORK_REQUEST_TABS.find((tab) => isWorkRequestTabActive(tab.id, pathname))
  return match?.id ?? null
}

export function visibleWorkRequestTabs(canRead) {
  const allow = typeof canRead === 'function' ? canRead : () => true
  return WORK_REQUEST_TABS.filter((tab) => allow(tab.moduleKey))
}

export function defaultWorkRequestTab(canRead) {
  const tabs = visibleWorkRequestTabs(canRead)
  return tabs.find((tab) => tab.id === 'create') || tabs[0] || null
}
