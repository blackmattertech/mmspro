export const WORK_REQUEST_TABS = [
  {
    id: 'create',
    label: 'Create',
    segment: 'work-request/create',
    moduleKey: 'work_request_create',
  },
  {
    id: 'my',
    label: 'My Requests',
    segment: 'work-request/my',
    moduleKey: 'work_request_my',
  },
  {
    id: 'incoming',
    label: 'Incoming',
    segment: 'work-request/incoming',
    moduleKey: 'work_request_incoming',
  },
  {
    id: 'outgoing',
    label: 'Outgoing',
    segment: 'work-request/outgoing',
    moduleKey: 'work_request_outgoing',
  },
  {
    id: 'all',
    label: 'All Requests',
    segment: 'work-request/all',
    moduleKey: 'work_request_all',
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
